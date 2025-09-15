// utils/itemProcessorManager.js
const EventEmitter = require('events');
const mongoose = require('mongoose');
const settingsService = require('./settingsService');
const Order = require('../models/Order');
const Log = require('../models/Log');
const fetch = require('node-fetch');
const Worker = require('../models/Worker');

class ItemProcessorManager extends EventEmitter {
    constructor() {
        super();
        this.io = null;
        this.timer = null;
        this.config = {};
        this.status = 'STOPPED';
        this.isFetching = false;
        this.workerIndex = 0;
    }

    initialize(io) {
        this.io = io;
        console.log('🔄 Initializing Item Processor Manager...');
        this.config = settingsService.get('itemProcessor');
        // Luôn khởi động tiến trình, không cần kiểm tra isEnabled
        this.start();
    }
    
    async updateConfig(newConfig) {
        const oldConfig = { ...this.config };
        this.config = { ...this.config, ...newConfig };

        await settingsService.update('itemProcessor', this.config);
        console.log(`[ItemProcessor] Config updated: ${JSON.stringify(this.config)}`);

        // Chỉ kiểm tra nếu interval thay đổi để restart
        const intervalChanged = this.config.pollingInterval !== oldConfig.pollingInterval;

        if (intervalChanged) {
            this.restart();
        } else {
            this.emitStatus();
        }
    }

    start() {
        if (this.timer) clearInterval(this.timer);
        const intervalMs = this.config.pollingInterval * 1000;
        console.log(`[ItemProcessor] Service started. Polling every ${this.config.pollingInterval} seconds.`);
        this.status = 'RUNNING';
        
        this.timer = setInterval(() => this.findAndDispatchItems(), intervalMs);
        this.findAndDispatchItems();
        this.emitStatus();
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.status = 'STOPPED';
        console.log('[ItemProcessor] Service stopped.');
        this.emitStatus();
    }

    restart() {
        console.log('[ItemProcessor] Restarting service...');
        this.stop();
        setTimeout(() => this.start(), 200);
    }

    async findAndDispatchItems() {
        if (this.isFetching) return;
        this.isFetching = true;
        this.emitStatus();

        try {
            
            const onlineWorkers = await Worker.find({ status: 'online', isEnabled: true });

            if (onlineWorkers.length === 0) {
                if(this.io) this.io.emit('itemProcessor:log', '⚠️ Không có worker nào online để xử lý.');
                return;
            }

            const ordersWithQueuedItems = await Order.find({
                status: { $in: ['pending', 'processing'] },
                'items.status': 'queued'
            }).limit(this.config.concurrency * onlineWorkers.length).sort({ createdAt: 1 });

            if (ordersWithQueuedItems.length === 0) return;

            for (const order of ordersWithQueuedItems) {
                 if (order.status === 'pending') {
                    await Order.findByIdAndUpdate(order._id, { status: 'processing' });
                    await this.writeLog(order._id, 'INFO', `Order status updated to 'processing'.`);
                }

                const itemsToProcess = order.items.filter(item => item.status === 'queued');

                for (const item of itemsToProcess) {
                    const worker = onlineWorkers[this.workerIndex % onlineWorkers.length];
                    this.workerIndex++;
                    await this.dispatchItemToWorker(worker, order._id, item);
                }
            }
        } catch (error) {
            console.error('[ItemProcessor] Error finding and dispatching items:', error);
        } finally {
            this.isFetching = false;
            this.emitStatus();
        }
    }

    async dispatchItemToWorker(worker, orderId, item) {
        const { url, username, password } = worker;
        const auth = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');

        try {
            const updatedOrder = await Order.findOneAndUpdate(
                { "_id": orderId, "items._id": item._id, "items.status": "queued" },
                { "$set": { "items.$.status": "processing" } },
                { new: true }
            );
            
            if(!updatedOrder) {
                return;
            }

            // === START: THAY ĐỔI DÒNG LOG TẠI ĐÂY ===
            if(this.io) {
                const logMessage = `Đơn hàng ...${orderId.toString().slice(-6)}: Gửi item ...${item._id.toString().slice(-6)} tới worker <strong class="text-blue-400">${worker.name}</strong>`;
                this.io.emit('itemProcessor:log', logMessage);
            }
            // === END: THAY ĐỔI DÒNG LOG TẠI ĐÂY ===
            
            const response = await fetch(`${url}/api/process-item`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': auth 
                },
                body: JSON.stringify({
                    orderId: orderId.toString(),
                    itemId: item._id.toString(),
                    itemData: item.data
                }),
                timeout: 10000
            });
            
            if (!response.ok || response.status !== 202) {
                throw new Error(`Worker returned status ${response.status}`);
            }

        } catch (error) {
            console.error(`Failed to dispatch item ${item._id} to ${worker.name}: ${error.message}`);
             await Order.updateOne(
                { "_id": orderId, "items._id": item._id },
                { "$set": { "items.$.status": "queued" } }
            );
            await this.writeLog(orderId, 'ERROR', `Failed to dispatch item ${item._id} to worker ${worker.name}. Re-queueing.`);
        }
    }
    
    async processSingleItem(orderId, itemId, itemData) {
        try {
            if(this.io) this.io.emit('itemProcessor:log', `> Worker đang xử lý item ${itemId.slice(-6)}`);
            await this.writeLog(orderId, 'INFO', `Worker started processing item ${itemId}. Data: "${itemData}"`);
            
            await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));
    
            await Order.updateOne(
                { "_id": orderId, "items._id": itemId },
                { "$set": { "items.$.status": "completed" } }
            );
            await this.writeLog(orderId, 'INFO', `Item ${itemId} completed successfully.`);
            if(this.io) this.io.emit('itemProcessor:log', `✔ Hoàn thành item ${itemId.slice(-6)}`);
    
            await this.checkOrderCompletion(orderId);

        } catch(error) {
            console.error(`[Worker] Error processing item ${itemId}:`, error);
            await Order.updateOne(
                { "_id": orderId, "items._id": itemId },
                { "$set": { "items.$.status": "failed" } }
            );
            await this.writeLog(orderId, 'ERROR', `Item ${itemId} failed. Error: ${error.message}`);
        }
    }
    
    async checkOrderCompletion(orderId) {
        const order = await Order.findById(orderId);
        if (!order || order.status === 'completed' || order.status === 'failed') return;
        
        const pendingItems = order.items.filter(item => ['queued', 'processing'].includes(item.status));
        
        if (pendingItems.length === 0) {
            const hasFailedItems = order.items.some(item => item.status === 'failed');
            const finalStatus = hasFailedItems ? 'failed' : 'completed';
            
            await Order.findByIdAndUpdate(orderId, { status: finalStatus });
            const logMessage = `🎉 Order ${orderId.toString().slice(-6)} đã HOÀN THÀNH (status: ${finalStatus})!`;
            if(this.io) this.io.emit('itemProcessor:log', logMessage);
            await this.writeLog(orderId, 'INFO', `Order has been fully processed with final status: ${finalStatus}.`);
        }
    }

    getStatus() {
        return {
            status: this.status,
            config: this.config,
            activeTasks: 0,
            queuedTasks: 0,
        };
    }

    emitStatus() {
        if (this.io) {
            this.io.emit('itemProcessor:statusUpdate', this.getStatus());
        }
    }

    async writeLog(orderId, level, message) {
        try {
            await Log.create({ orderId, level, message });
        } catch (error) {
            console.error(`Failed to write log for order ${orderId}:`, error);
        }
    }
}

module.exports = new ItemProcessorManager();