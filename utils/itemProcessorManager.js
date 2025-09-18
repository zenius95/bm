// utils/itemProcessorManager.js
const EventEmitter = require('events');
const settingsService = require('./settingsService');
const Order = require('../models/Order');
const Item = require('../models/Item');
const Account = require('../models/Account');
const Log = require('../models/Log');
const User = require('../models/User');
const { logActivity } = require('./activityLogService');
const { runAppealProcess } = require('../insta/runInsta');

// --- Hằng số cấu hình ---
const MAX_ITEM_RETRIES = 3;
const DELAY_BETWEEN_ACCOUNTS = 1000; // ms, delay khi thử lại với account khác
const LOG_BATCH_INTERVAL = 2000; // Gửi log mỗi 2 giây
const SIMULATION_KEYWORDS = ['success', 'error'];

class ItemProcessorManager extends EventEmitter {
    constructor() {
        super();
        this.io = null;
        this.timer = null;
        this.config = {};
        this.status = 'STOPPED';
        this.activeWorkers = 0;
        this.logBuffer = new Map();
        this.logSenderInterval = null;
    }

    initialize(io) {
        this.io = io;
        console.log('🔄 Initializing Item Processor Manager (Autonomous Mode)...');
        this.config = settingsService.get('itemProcessor');
        this.start();
    }
    
    async updateConfig(newConfig) {
        const oldConfig = { ...this.config };
        this.config = { ...this.config, ...newConfig };

        await settingsService.update('itemProcessor', this.config);
        console.log(`[ItemProcessor] Config updated: ${JSON.stringify(this.config)}`);

        if (this.config.concurrency !== oldConfig.concurrency) {
            this.restart();
        } else {
            this.emitStatus();
        }
    }

    start() {
        if (this.timer) clearInterval(this.timer);
        const intervalMs = this.config.pollingInterval * 1000;
        console.log(`[ItemProcessor] Service started. Polling every ${this.config.pollingInterval}s.`);
        this.status = 'RUNNING';
        
        this.timer = setInterval(() => this.spawnWorkers(), intervalMs);
        this.spawnWorkers();
        this.emitStatus();

        if (this.logSenderInterval) clearInterval(this.logSenderInterval);
        this.logSenderInterval = setInterval(() => this.sendBufferedLogs(), LOG_BATCH_INTERVAL);
    }

    stop() {
        if (this.timer) clearInterval(this.timer);
        if (this.logSenderInterval) clearInterval(this.logSenderInterval);
        this.timer = null;
        this.logSenderInterval = null;
        this.status = 'STOPPED';
        console.log('[ItemProcessor] Service stopped.');
        this.emitStatus();
    }

    restart() {
        console.log('[ItemProcessor] Restarting service...');
        this.stop();
        setTimeout(() => this.start(), 200);
    }

    sendBufferedLogs() {
        if (this.logBuffer.size === 0) return;

        for (const [itemId, logs] of this.logBuffer.entries()) {
            if (logs.length > 0) {
                this.io.to(`item_${itemId}`).emit('order:new_logs_batch', logs);
            }
        }
        this.logBuffer.clear();
    }

    spawnWorkers() {
        if (this.status !== 'RUNNING') return;
        const maxConcurrency = this.config.concurrency || 10;
        
        while (this.activeWorkers < maxConcurrency) {
            this.activeWorkers++;
            this.runWorkerSession().catch(err => {
                console.error('[ItemProcessor] A worker session failed critically:', err);
                this.addLogToUI(`<span class="text-red-400">Worker session error: ${err.message}</span>`);
            }).finally(() => {
                this.activeWorkers--;
                this.spawnWorkers();
            });
        }
        this.emitStatus();
    }
    
    async runWorkerSession() {
        const item = await Item.findOneAndUpdate(
            { status: 'queued' },
            { $set: { status: 'processing' } },
            { new: true, sort: { createdAt: 1 } }
        ).lean();

        if (!item) {
            return;
        }

        const parentOrder = await Order.findById(item.orderId);
        if (parentOrder && parentOrder.status === 'pending') {
            parentOrder.status = 'processing';
            await parentOrder.save();
            this.io.to(`order_${parentOrder._id.toString()}`).emit('order:update', { id: parentOrder._id.toString(), status: 'processing' });
            this.addLogToUI(`Đơn hàng <strong class="text-blue-400">#${parentOrder.shortId}</strong> bắt đầu được xử lý.`);
        }

        const itemDataLowerCase = item.data.toLowerCase().trim();
        if (SIMULATION_KEYWORDS.includes(itemDataLowerCase)) {
            const delay = Math.random() * (3000 - 1000) + 1000;
            await new Promise(resolve => setTimeout(resolve, delay));

            if (itemDataLowerCase === 'success') {
                await Item.findByIdAndUpdate(item._id, { status: 'completed' });
                await this.writeLog(item.orderId, item._id, 'INFO', `Item giả lập thành công.`);
                await this.updateOrderProgress(item.orderId, 'completed', item);
            } else if (itemDataLowerCase === 'error') {
                await Item.findByIdAndUpdate(item._id, { status: 'failed' });
                await this.writeLog(item.orderId, item._id, 'ERROR', `Item giả lập thất bại.`);
                await this.updateOrderProgress(item.orderId, 'failed', item);
            }
            return;
        }

        this.addLogToUI(`Worker đã nhận item <strong class="text-yellow-400">...${item.data.slice(-10)}</strong>. Bắt đầu tìm account...`);

        let success = false;
        let attemptCount = 0;
        const usedAccountIds = []; // <<< SỬA LỖI 1: Khởi tạo danh sách account đã thử

        while (attemptCount < MAX_ITEM_RETRIES && !success) {
            attemptCount++;
            const account = await this.acquireAccount(usedAccountIds); // <<< SỬA LỖI 1: Truyền danh sách đã thử
            if (!account) {
                this.addLogToUI('Tạm thời không có account nào khả dụng. Sẽ thử lại sau.');
                await this.writeLog(item.orderId, item._id, 'ERROR', `Không tìm thấy account khả dụng để xử lý item: "${item.data}"`);
                await new Promise(resolve => setTimeout(resolve, 5000));
                continue;
            }
            
            usedAccountIds.push(account._id); // <<< SỬA LỖI 1: Thêm account vào danh sách đã thử

            const logCallback = (message) => {
                const formattedMessage = `[<strong class="text-green-400">${account.uid}</strong> | <strong class="text-yellow-400">${item.data}</strong>] ${message}`;
                this.addLogToUI(formattedMessage);
                this.writeLog(item.orderId, item._id, 'INFO', `[${account.uid}|${item.data}] ${message}`);
            };

            this.addLogToUI(`> Thử xử lý item <strong class="text-yellow-400">${item.data}</strong> với account <strong class="text-green-400">${account.uid}</strong> (Lần thử: ${attemptCount})`);
            
            try {
                const result = await runAppealProcess({
                    username: account.uid,
                    password: account.password,
                    twofa_secret: account.twofa,
                    proxy_string: account.proxy,
                    id: account._id.toString()
                }, item.data, logCallback);
                
                if (result === true) {
                    await Item.findByIdAndUpdate(item._id, { status: 'completed', processedWith: account._id });
                    this.addLogToUI(`✔ Hoàn thành item ...${item.data.slice(-10)}`);
                    await this.writeLog(item.orderId, item._id, 'INFO', `Xử lý thành công item "${item.data}" với account ${account.uid}.`);
                    await this.updateAccountOnFinish(account, true);
                    await this.updateOrderProgress(item.orderId, 'completed', item);
                    success = true;
                } else {
                    throw new Error("Quy trình kháng không hoàn tất hoặc không trả về trạng thái thành công.");
                }

            } catch (error) {
                this.addLogToUI(`<span class="text-red-400">✘ Account <strong class="text-green-400">${account.uid}</strong> thất bại với item ...${item.data.slice(-10)}. Lý do: ${error.message}</span>`);
                await this.writeLog(item.orderId, item._id, 'ERROR', `Xử lý thất bại item "${item.data}" với account ${account.uid}. Lý do: ${error.message}`);
                await this.updateAccountOnFinish(account, false);
                await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_ACCOUNTS));
            }
        }

        if (!success) {
            this.addLogToUI(`<span class="text-red-500 font-bold">Item ...${item.data.slice(-10)} đã thất bại ${MAX_ITEM_RETRIES} lần và bị hủy.</span>`);
            await Item.findByIdAndUpdate(item._id, { status: 'failed' });
            await this.writeLog(item.orderId, item._id, 'ERROR', `Item "${item.data}" đã thất bại sau ${MAX_ITEM_RETRIES} lần thử và bị hủy.`);
            await this.updateOrderProgress(item.orderId, 'failed', item);
        }
    }

    async acquireAccount(excludeIds = []) { // <<< SỬA LỖI 1: Thêm tham số excludeIds
        return Account.findOneAndUpdate(
            { status: 'LIVE', isDeleted: false, _id: { $nin: excludeIds } }, // <<< SỬA LỖI 1: Loại trừ các ID đã thử
            { $set: { status: 'IN_USE' } },
            { new: true, sort: { lastUsedAt: 1 } }
        );
    }
    
    async updateAccountOnFinish(account, wasSuccessful) {
        let update;
        if (wasSuccessful) {
            // <<< SỬA LỖI 2: Reset errorCount khi thành công
            update = {
                $inc: { successCount: 1 },
                $set: { lastUsedAt: new Date(), errorCount: 0 } 
            };
        } else {
            update = {
                $inc: { errorCount: 1 },
                $set: { lastUsedAt: new Date() }
            };
        }

        const updatedAccount = await Account.findByIdAndUpdate(account._id, update, { new: true });

        const { maxSuccess, maxError } = settingsService.get('itemProcessor');
        if ((maxSuccess > 0 && updatedAccount.successCount >= maxSuccess) || (maxError > 0 && updatedAccount.errorCount >= maxError)) {
            updatedAccount.status = 'RESTING';
            this.addLogToUI(`Account <strong class="text-blue-400">${updatedAccount.uid}</strong> đã đạt ngưỡng và chuyển sang trạng thái nghỉ.`);
        } else {
            updatedAccount.status = 'LIVE';
        }
        
        await updatedAccount.save();
        return updatedAccount;
    }

    async updateOrderProgress(orderId, lastItemStatus, item) {
        const updateField = lastItemStatus === 'completed' ? 'completedItems' : 'failedItems';
        
        const order = await Order.findByIdAndUpdate(orderId, 
            { $inc: { [updateField]: 1 } },
            { new: true }
        ).populate('user');

        if (!order) return;
        
        const updatedItem = await Item.findById(item._id).lean();
        const orderRoom = `order_${orderId}`;
        const userRoom = `user_${order.user._id.toString()}`;
        this.io.to(orderRoom).to(userRoom).emit('order:item_update', {
            id: order._id.toString(),
            completedItems: order.completedItems,
            failedItems: order.failedItems,
            totalItems: order.totalItems,
            item: updatedItem
        });
        
        if ((order.completedItems + order.failedItems) >= order.totalItems) {
            await this.checkOrderCompletion(order);
        }
    }

    async checkOrderCompletion(order) {
        if (!order) return;

        const initialCost = order.pricePerItem * order.totalItems;
        
        const finalPricePerItem = settingsService.calculatePricePerItem(order.completedItems);
        const finalCost = order.completedItems * finalPricePerItem;
        const refundAmount = initialCost - finalCost;

        order.status = 'completed';
        order.totalCost = finalCost;

        let user = await User.findById(order.user._id);
        const balanceBefore = user.balance;

        if (refundAmount > 0) {
            user.balance += refundAmount;
            
            const logDetails = `Hoàn tiền chênh lệch ${refundAmount.toLocaleString('vi-VN')}đ cho đơn hàng #${order.shortId} sau khi quyết toán.`;
            await logActivity(user._id, 'ORDER_REFUND', {
                details: logDetails,
                context: 'Admin',
                metadata: {
                    balanceBefore: balanceBefore,
                    balanceAfter: user.balance,
                    change: refundAmount
                }
            });
            this.addLogToUI(`💰 Hoàn tiền chênh lệch ${refundAmount.toLocaleString('vi-VN')}đ cho user <strong class="text-white">${user.username}</strong> (đơn hàng ...${order.shortId})`);
        }

        await Promise.all([order.save(), user.save()]);
        
        const orderRoom = `order_${order._id.toString()}`;
        const userRoom = `user_${order.user._id.toString()}`;
        this.io.to(orderRoom).to(userRoom).emit('order:update', { id: order._id.toString(), status: 'completed' });
        
        const [ totalOrderCount, processingOrderCount, completedOrderCount, failedOrderCount ] = await Promise.all([
             Order.countDocuments({ isDeleted: false }),
             Order.countDocuments({ status: 'processing', isDeleted: false }),
             Order.countDocuments({ status: 'completed', isDeleted: false }),
             Order.countDocuments({ status: 'failed', isDeleted: false })
        ]);
        this.io.emit('dashboard:stats:update', { 
            orderStats: { total: totalOrderCount, processing: processingOrderCount, completed: completedOrderCount, failed: failedOrderCount }
        });

        const logMessage = `🎉 Đơn hàng ${order.shortId} đã HOÀN THÀNH!`;
        this.addLogToUI(logMessage);
    }

    getStatus() {
        return {
            status: this.status,
            config: this.config,
            activeTasks: this.activeWorkers,
            queuedTasks: 0,
        };
    }

    emitStatus() {
        if (this.io) {
            this.io.emit('itemProcessor:statusUpdate', this.getStatus());
        }
    }

    addLogToUI(message) {
        if (this.io) {
            this.io.emit('itemProcessor:log', message);
        }
    }

    async writeLog(orderId, itemId, level, message) {
        try {
            const newLog = await Log.create({ orderId, itemId, level, message });
            
            if (!this.logBuffer.has(itemId)) {
                this.logBuffer.set(itemId, []);
            }
            this.logBuffer.get(itemId).push(newLog);

        } catch (error) {
            console.error(`Failed to write log for item ${itemId}:`, error);
        }
    }
}

module.exports = new ItemProcessorManager();