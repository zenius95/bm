// utils/itemProcessorManager.js
const EventEmitter = require('events');
const mongoose = require('mongoose');
const settingsService = require('./settingsService');
const Order = require('../models/Order');
const Log = require('../models/Log');
const ProcessRunner = require('./processRunner');

class ItemProcessorManager extends EventEmitter {
    constructor() {
        super();
        this.io = null;
        this.timer = null;
        this.config = {};
        this.status = 'STOPPED';
        this.runner = null;
        this.isFetching = false;
    }

    initialize(io) {
        this.io = io;
        console.log('🔄 Initializing Item Processor Manager...');
        this.config = settingsService.get('itemProcessor');

        this.runner = new ProcessRunner({
            concurrency: this.config.concurrency,
            delay: 200,
            retries: 2,
            timeout: 60000,
        });
        this.registerRunnerEvents();

        if (this.config.isEnabled) {
            this.start();
        } else {
            this.emitStatus();
        }
    }
    
    async updateConfig(newConfig) {
        const oldConfig = { ...this.config };
        this.config = { ...this.config, ...newConfig };

        await settingsService.update('itemProcessor', this.config);
        console.log(`[ItemProcessor] Config updated: ${JSON.stringify(this.config)}`);

        // Cập nhật cấu hình cho ProcessRunner đang chạy
        this.runner.options.concurrency = this.config.concurrency;

        const wasEnabled = oldConfig.isEnabled;
        const isNowEnabled = this.config.isEnabled;
        const intervalChanged = this.config.pollingInterval !== oldConfig.pollingInterval;

        if (wasEnabled && !isNowEnabled) this.stop();
        else if (!wasEnabled && isNowEnabled) this.start();
        else if (wasEnabled && isNowEnabled && intervalChanged) this.restart();
        else this.emitStatus();
    }

    start() {
        if (this.timer) clearInterval(this.timer);
        const intervalMs = this.config.pollingInterval * 1000;
        console.log(`[ItemProcessor] Service started. Polling every ${this.config.pollingInterval} seconds.`);
        this.status = 'RUNNING';
        
        this.timer = setInterval(() => this.findAndQueueItems(), intervalMs);
        this.findAndQueueItems(); // Chạy lần đầu
        this.emitStatus();
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.runner.stop();
        this.status = 'STOPPED';
        console.log('[ItemProcessor] Service stopped.');
        this.emitStatus();
    }

    restart() {
        console.log('[ItemProcessor] Restarting service...');
        this.stop();
        setTimeout(() => this.start(), 200);
    }

    registerRunnerEvents() {
        this.runner.on('task:start', ({ taskWrapper }) => {
            this.io.emit('itemProcessor:log', `> Bắt đầu item ${taskWrapper.id.slice(-6)} của Order ${taskWrapper.orderId.slice(-6)}`);
        });

        this.runner.on('task:complete', async ({ taskWrapper }) => {
            this.io.emit('itemProcessor:log', `✔ Hoàn thành item ${taskWrapper.id.slice(-6)}`);
            await this.checkOrderCompletion(taskWrapper.orderId);
        });

        this.runner.on('task:error', async ({ error, taskWrapper }) => {
            this.io.emit('itemProcessor:log', `✖ Lỗi item ${taskWrapper.id.slice(-6)}: ${error}`);
            await this.checkOrderCompletion(taskWrapper.orderId);
        });

        this.runner.on('end', () => {
             this.io.emit('itemProcessor:log', 'Tất cả các task trong lô đã xong. Chờ task mới...');
             this.emitStatus();
        });
    }

    async findAndQueueItems() {
        if (this.isFetching) return;
        this.isFetching = true;

        try {
            const currentQueueSize = this.runner.queue.length + this.runner.activeTasks;
            const limit = this.config.concurrency * 2 - currentQueueSize;
            if (limit <= 0) return;

            const ordersWithQueuedItems = await Order.find({
                status: { $in: ['pending', 'processing'] },
                'items.status': 'queued'
            }).limit(limit).sort({ createdAt: 1 });

            if (ordersWithQueuedItems.length === 0) return;

            const tasks = [];
            for (const order of ordersWithQueuedItems) {
                if (order.status === 'pending') {
                    order.status = 'processing';
                    await order.save();
                    await this.writeLog(order._id, 'INFO', `Order status updated to 'processing'.`);
                }
                const itemsToProcess = order.items.filter(item => item.status === 'queued');
                for (const item of itemsToProcess) {
                     tasks.push({
                        id: item._id.toString(),
                        orderId: order._id.toString(),
                        task: () => this.processSingleItem(order._id, item._id, item.data)
                    });
                }
            }

            if (tasks.length > 0) {
                this.runner.addTasks(tasks);
                this.io.emit('itemProcessor:log', `Tìm thấy và đã thêm ${tasks.length} item mới vào hàng đợi.`);
                if (this.runner.status !== 'running') this.runner.start();
            }
        } catch (error) {
            console.error('[ItemProcessor] Error finding items:', error);
        } finally {
            this.isFetching = false;
            this.emitStatus();
        }
    }

    async processSingleItem(orderId, itemId, itemData) {
        await Order.updateOne(
            { "_id": orderId, "items._id": itemId },
            { "$set": { "items.$.status": "processing" } }
        );
        
        // GIẢ LẬP CÔNG VIỆC
        await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 2000));


        await Order.updateOne(
            { "_id": orderId, "items._id": itemId },
            { "$set": { "items.$.status": "completed" } }
        );
    }
    
    async checkOrderCompletion(orderId) {
        const order = await Order.findById(orderId);
        if (!order || order.status === 'completed' || order.status === 'failed') return;
        const pendingItems = order.items.filter(item => ['queued', 'processing'].includes(item.status));
        if (pendingItems.length === 0) {
            order.status = 'completed';
            await order.save();
            this.io.emit('itemProcessor:log', `🎉 Order ${orderId.toString().slice(-6)} đã HOÀN THÀNH!`);
            await this.writeLog(orderId, 'INFO', 'Order has been fully completed.');
        }
    }

    getStatus() {
        return {
            status: this.status,
            config: this.config,
            activeTasks: this.runner ? this.runner.activeTasks : 0,
            queuedTasks: this.runner ? this.runner.queue.length : 0,
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