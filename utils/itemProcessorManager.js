// utils/itemProcessorManager.js
const EventEmitter = require('events');
const mongoose = require('mongoose');
const settingsService = require('./settingsService');
const Order = require('../models/Order');
const Log = require('../models/Log');
const fetch = require('node-fetch');
const Worker = require('../models/Worker');
const User = require('../models/User'); 
const { logActivity } = require('./activityLogService');

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
        this.start();
    }
    
    async updateConfig(newConfig) {
        const oldConfig = { ...this.config };
        this.config = { ...this.config, ...newConfig };

        await settingsService.update('itemProcessor', this.config);
        console.log(`[ItemProcessor] Config updated: ${JSON.stringify(this.config)}`);

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
                    if(this.io) this.io.emit('order:update', { id: order._id.toString(), status: 'processing' });
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
        const { url, apiKey } = worker;
        if (!apiKey) {
            console.error(`Worker ${worker.name} is missing an API Key. Skipping.`);
            await this.writeLog(orderId, 'ERROR', `Worker ${worker.name} is missing an API Key.`);
            return;
        }

        try {
            const updatedOrder = await Order.findOneAndUpdate(
                { "_id": orderId, "items._id": item._id, "items.status": "queued" },
                { "$set": { "items.$.status": "processing" } },
                { new: true }
            );
            
            if(!updatedOrder) return;

            if(this.io) {
                const logMessage = `Đơn hàng ...${orderId.toString().slice(-6)}: Gửi item ...${item.shortId} tới worker <strong class="text-blue-400">${worker.name}</strong>`;
                this.io.emit('itemProcessor:log', logMessage);
            }
            
            const response = await fetch(`${url}/worker-api/process-item`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-API-Key': apiKey 
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

            if (itemData.trim() === 'lỗi') {
                throw new Error("Giả lập lỗi xử lý item.");
            }
    
            const updatedOrder = await Order.findOneAndUpdate(
                { "_id": orderId, "items._id": itemId },
                { "$set": { "items.$.status": "completed" } },
                { new: true } 
            ).lean();

            await this.writeLog(orderId, 'INFO', `Item ${itemId} completed successfully.`);
            if(this.io) this.io.emit('itemProcessor:log', `✔ Hoàn thành item ${itemId.slice(-6)}`);
    
            const completedItem = updatedOrder.items.find(i => i._id.toString() === itemId);
            this.updateAndEmitItemCounts(updatedOrder, completedItem);
            await this.checkOrderCompletion(updatedOrder);

        } catch(error) {
            console.error(`[Worker] Error processing item ${itemId}:`, error);

            const updatedOrderAfterFail = await Order.findOneAndUpdate(
                { "_id": orderId, "items._id": itemId },
                { "$set": { "items.$.status": "failed" } },
                { new: true }
            ).lean();

            await this.writeLog(orderId, 'ERROR', `Item ${itemId} failed. Error: ${error.message}`);
            
            if (updatedOrderAfterFail) {
                const failedItem = updatedOrderAfterFail.items.find(i => i._id.toString() === itemId);
                await this.refundUserForItem(updatedOrderAfterFail, itemId, error.message);
                this.updateAndEmitItemCounts(updatedOrderAfterFail, failedItem);
                await this.checkOrderCompletion(updatedOrderAfterFail);
            }
        }
    }
    
    updateAndEmitItemCounts(order, updatedItem = null) {
        if (!order) return;

        const completedItems = order.items.filter(item => item.status === 'completed').length;
        const failedItems = order.items.filter(item => item.status === 'failed').length;

        const payload = {
            id: order._id.toString(),
            completedItems,
            failedItems,
        };

        if (updatedItem) {
            payload.item = {
                _id: updatedItem._id.toString(),
                status: updatedItem.status,
                data: updatedItem.data
            };
        }

        this.io.emit('order:item_update', payload);
    }

    async refundUserForItem(order, itemId, reason) {
        try {
            const refundAmount = order.pricePerItem;
            if (refundAmount <= 0) return;

            const updatedUser = await User.findByIdAndUpdate(
                order.user,
                { $inc: { balance: refundAmount } },
                { new: true }
            ).lean();

            if (!updatedUser) {
                await this.writeLog(order._id, 'ERROR', `Refund failed for item ${itemId}. User ${order.user} not found.`);
                return;
            }
            
            const originalBalance = updatedUser.balance - refundAmount;
            const logDetails = `Hoàn tiền ${refundAmount.toLocaleString('vi-VN')}đ cho user '${updatedUser.username}' do item trong đơn hàng #${order.shortId} thất bại. Lý do: ${reason}.`;

            await this.writeLog(order._id, 'INFO', `Refunded ${refundAmount} to user ${updatedUser.username}.`);
            await logActivity(updatedUser._id, 'ORDER_REFUND', {
                details: logDetails,
                context: 'Admin',
                // --- THÊM DỮ LIỆU CÓ CẤU TRÚC ---
                metadata: {
                    balanceBefore: originalBalance,
                    balanceAfter: updatedUser.balance,
                    change: refundAmount
                }
            });

            console.log(`[Refund] ${logDetails}`);
            if(this.io) this.io.emit('itemProcessor:log', `💰 Hoàn tiền ${refundAmount.toLocaleString('vi-VN')}đ cho user <strong>${updatedUser.username}</strong> (đơn hàng ...${order.shortId})`);

        } catch (e) {
            console.error(`[Refund] CRITICAL ERROR during refund for order ${order._id}:`, e);
            await this.writeLog(order._id, 'ERROR', `CRITICAL: Refund failed for item ${itemId}. Error: ${e.message}`);
        }
    }
    
    async checkOrderCompletion(order) {
        if (!order || order.status === 'completed') return;
        
        const pendingItems = order.items.filter(item => ['queued', 'processing'].includes(item.status));
        
        if (pendingItems.length === 0) {
            const finalStatus = 'completed';
            
            await Order.findByIdAndUpdate(order._id, { status: finalStatus });
            if(this.io) this.io.emit('order:update', { id: order._id.toString(), status: finalStatus });
            
            const [ totalOrderCount, processingOrderCount, completedOrderCount, failedOrderCount ] = await Promise.all([
                 Order.countDocuments({ isDeleted: false }),
                 Order.countDocuments({ status: { $in: ['pending', 'processing'] }, isDeleted: false }),
                 Order.countDocuments({ status: 'completed', isDeleted: false }),
                 Order.countDocuments({ status: 'failed', isDeleted: false })
            ]);
            this.io.emit('dashboard:stats:update', { 
                orderStats: {
                    total: totalOrderCount,
                    processing: processingOrderCount,
                    completed: completedOrderCount,
                    failed: failedOrderCount
                }
            });

            const logMessage = `🎉 Order ${order.shortId} đã HOÀN THÀNH (status: ${finalStatus})!`;
            if(this.io) this.io.emit('itemProcessor:log', logMessage);
            await this.writeLog(order._id, 'INFO', `Order has been fully processed with final status: ${finalStatus}.`);
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