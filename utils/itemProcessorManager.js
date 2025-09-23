// utils/itemProcessorManager.js
const EventEmitter = require('events');
const settingsService = require('../utils/settingsService');
const Order = require('../models/Order');
const Item = require('../models/Item');
const Account = require('../models/Account');
const Log = require('../models/Log');
const User = require('../models/User');
const { logActivity } = require('./activityLogService');
const { runAppealProcess } = require('../insta/runInsta');
const ProcessRunner = require('./processRunner');

// --- Hằng số cấu hình ---
const MAX_ITEM_RETRIES = 3;
const DELAY_BETWEEN_ACCOUNTS = 1000;
const LOG_BATCH_INTERVAL = 2000;
const SIMULATION_KEYWORDS = ['success', 'error'];

class ItemProcessorManager extends EventEmitter {
    constructor() {
        super();
        this.io = null;
        this.timer = null;
        this.config = {};
        this.status = 'STOPPED';
        this.isProcessingBatch = false;
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
        this.config = { ...this.config, ...newConfig };
        await settingsService.update('itemProcessor', this.config);
        console.log(`[ItemProcessor] Config updated: ${JSON.stringify(this.config)}`);
        this.emitStatus();
    }

    start() {
        if (this.timer) clearInterval(this.timer);
        const intervalMs = (settingsService.get('itemProcessor').pollingInterval || 5) * 1000;
        console.log(`[ItemProcessor] Service started. Polling every ${intervalMs / 1000}s.`);
        this.status = 'RUNNING';
        
        this.timer = setInterval(() => this.processQueuedItems(), intervalMs);
        this.processQueuedItems();
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
    
    async processQueuedItems() {
        if (this.status !== 'RUNNING' || this.isProcessingBatch) return;

        this.isProcessingBatch = true;
        try {
            const currentConfig = settingsService.get('itemProcessor');
            const maxConcurrency = currentConfig.concurrency || 10;
            const itemProcessingTimeout = currentConfig.timeout || 180000;
            
            const items = await Item.find({ status: 'queued' })
                                    .sort({ createdAt: 1 })
                                    .limit(maxConcurrency)
                                    .lean();
            
            if (items.length === 0) return;
            
            console.log(`[ItemProcessor] Found ${items.length} items to process.`);
            
            const itemIds = items.map(i => i._id);
            await Item.updateMany({ _id: { $in: itemIds } }, { $set: { status: 'processing' } });

            const runner = new ProcessRunner({
                concurrency: maxConcurrency,
                delay: 100,
                timeout: itemProcessingTimeout,
                retries: 0
            });

            const tasks = items.map(item => ({
                id: item._id.toString(),
                itemData: item,
                task: () => this.runSingleItemTask(item)
            }));

            runner.addTasks(tasks);

            runner.on('task:complete', async ({ result, taskWrapper }) => {
                const { account, item } = result;
                await this.updateAccountOnFinish(account, true);
                await this.updateOrderProgress(item.orderId, 'completed', item);
            });

            runner.on('task:error', async ({ error, taskWrapper }) => {
                const itemData = taskWrapper.itemData;
                console.error(`[ItemProcessor] Task for item ${itemData._id} failed: ${error.message}`);

                // <<< START: LOGIC BẮT LỖI TIMEOUT BẰNG MÃ LỖI >>>
                let logMessage;
                if (error.code === 'ETIMEOUT') {
                    logMessage = `Xử lý item quá thời gian cho phép (${itemProcessingTimeout / 1000}s).`;
                } else {
                    logMessage = `Xử lý item thất bại (lỗi nghiêm trọng): ${error.message}`;
                }
                // <<< END: LOGIC BẮT LỖI TIMEOUT BẰNG MÃ LỖI >>>

                await this.writeLog(itemData.orderId, itemData._id, 'ERROR', logMessage);
                await Item.findByIdAndUpdate(itemData._id, { status: 'failed' });
                await this.updateOrderProgress(itemData.orderId, 'failed', itemData);
            });
            
            runner.start();

        } catch (err) {
            console.error('[ItemProcessor] Critical error during item processing batch:', err);
        } finally {
            this.isProcessingBatch = false;
        }
    }
    
    async runSingleItemTask(item) {
        const parentOrder = await Order.findById(item.orderId);
        if (parentOrder && parentOrder.status === 'pending') {
            parentOrder.status = 'processing';
            await parentOrder.save();
            this.io.to(`order_${parentOrder._id.toString()}`).emit('order:update', { id: parentOrder._id.toString(), status: 'processing' });
            this.addLogToUI(`Đơn hàng <strong class="text-blue-400">#${parentOrder.shortId}</strong> bắt đầu được xử lý.`);
        }
        
        const itemDataLowerCase = item.data.toLowerCase().trim();
        if (SIMULATION_KEYWORDS.includes(itemDataLowerCase)) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            if (itemDataLowerCase === 'success') {
                await Item.findByIdAndUpdate(item._id, { status: 'completed' });
                await this.writeLog(item.orderId, item._id, 'INFO', `Item giả lập thành công.`);
                return { item, account: null };
            } else {
                throw new Error("Item giả lập thất bại.");
            }
        }

        let success = false;
        let attemptCount = 0;
        const usedAccountIds = [];
        let finalAccount = null;

        while (attemptCount < MAX_ITEM_RETRIES && !success) {
            attemptCount++;
            const account = await this.acquireAccount(usedAccountIds);
            if (!account) {
                await this.writeLog(item.orderId, item._id, 'ERROR', `Không tìm thấy account khả dụng (lần thử ${attemptCount}).`);
                await new Promise(resolve => setTimeout(resolve, 5000));
                continue;
            }
            
            usedAccountIds.push(account._id);

            const logCallback = (message) => {
                const formattedMessage = `[<strong class="text-green-400">${account.uid}</strong>] ${message}`;
                this.addLogToUI(formattedMessage);
                this.writeLog(item.orderId, item._id, 'INFO', `[${account.uid}] ${message}`);
            };

            try {
                const result = await runAppealProcess({
                    username: account.uid, 
                    password: account.password,
                    twofa_secret: account.twofa, 
                    proxy_string: account.proxy,
                    id: account._id.toString(),
                    lastUsedPhone: account.lastUsedPhone,
                    lastUsedPhoneCode: account.lastUsedPhoneCode,
                }, item.data, logCallback);
                
                if (result === true) {
                    await Item.findByIdAndUpdate(item._id, { status: 'completed', processedWith: account._id });
                    success = true;
                    finalAccount = account;
                } else {
                    throw new Error("Quy trình kháng không hoàn tất hoặc không trả về true.");
                }

            } catch (error) {
                await this.writeLog(item.orderId, item._id, 'ERROR', `Thất bại với account ${account.uid}. Lý do: ${error.message}`);
                await this.updateAccountOnFinish(account, false);
                await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_ACCOUNTS));
            }
        }

        if (success) {
            return { item, account: finalAccount };
        } else {
            throw new Error(`Item thất bại sau ${MAX_ITEM_RETRIES} lần thử.`);
        }
    }

    async acquireAccount(excludeIds = []) {
        return Account.findOneAndUpdate(
            { status: 'LIVE', isDeleted: false, _id: { $nin: excludeIds } },
            { $set: { status: 'IN_USE' } },
            { new: true, sort: { lastCheckedAt: 1 } }
        );
    }
    
    async updateAccountOnFinish(account, wasSuccessful) {
        if (!account) return;
        let update;
        if (wasSuccessful) {
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
            activeTasks: this.isProcessingBatch ? (this.config.concurrency || 10) : 0,
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
            if (this.io) {
                this.io.to(`order_${orderId}`).emit('order:new_log', newLog);
            }
        } catch (error) {
            console.error(`Failed to write log for item ${itemId}:`, error);
        }
    }
}

module.exports = new ItemProcessorManager();