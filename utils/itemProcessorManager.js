// utils/itemProcessorManager.js
const EventEmitter = require('events');
const settingsService = require('../utils/settingsService');
const Order = require('../models/Order');
const Item = require('../models/Item');
const Account = require('../models/Account');
const Log = require('../models/Log');
const User = require('../models/User');
const { logActivity } = require('./activityLogService');

// --- Hằng số cấu hình ---
const MAX_ITEM_RETRIES = 3;
const DELAY_BETWEEN_ACCOUNTS = 1000; // ms, delay khi thử lại với account khác

class ItemProcessorManager extends EventEmitter {
    constructor() {
        super();
        this.io = null;
        this.timer = null;
        this.config = {};
        this.status = 'STOPPED';
        this.activeWorkers = 0;
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
            return; // Không có item nào, kết thúc phiên
        }

        this.addLogToUI(`Worker đã nhận item <strong class="text-yellow-400">...${item.data.slice(-10)}</strong>. Bắt đầu tìm account...`);

        let success = false;
        let attemptCount = 0;

        while (attemptCount < MAX_ITEM_RETRIES && !success) {
            attemptCount++;
            const account = await this.acquireAccount();
            if (!account) {
                this.addLogToUI('Tạm thời không có account nào khả dụng. Sẽ thử lại sau.');
                await this.writeLog(item.orderId, item._id, 'ERROR', 'Không tìm thấy account khả dụng để xử lý.');
                await new Promise(resolve => setTimeout(resolve, 5000));
                continue;
            }

            this.addLogToUI(`> Thử xử lý item <strong class="text-yellow-400">...${item.data.slice(-10)}</strong> với account <strong class="text-green-400">${account.uid}</strong> (Lần thử: ${attemptCount})`);
            
            try {
                await this.simulateLogin(item, account);
                
                // Giả lập logic xử lý
                if (item.data.trim().toLowerCase() === 'lỗi') {
                    throw new Error("Giả lập lỗi xử lý item.");
                }

                // XỬ LÝ THÀNH CÔNG
                await Item.findByIdAndUpdate(item._id, { status: 'completed', processedWith: account._id });
                this.addLogToUI(`✔ Hoàn thành item ...${item.data.slice(-10)}`);
                await this.writeLog(item.orderId, item._id, 'INFO', `Xử lý thành công với account ${account.uid}.`);
                await this.updateAccountOnFinish(account, true);
                await this.updateOrderProgress(item.orderId, 'completed', item);
                success = true;

            } catch (error) {
                // XỬ LÝ THẤT BẠI
                this.addLogToUI(`<span class="text-red-400">✘ Account <strong class="text-green-400">${account.uid}</strong> thất bại với item ...${item.data.slice(-10)}.</span>`);
                await this.writeLog(item.orderId, item._id, 'ERROR', `Xử lý thất bại với account ${account.uid}. Lý do: ${error.message}`);
                await this.updateAccountOnFinish(account, false);
                await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_ACCOUNTS));
            }
        }

        // Nếu thoát vòng lặp mà không thành công
        if (!success) {
            this.addLogToUI(`<span class="text-red-500 font-bold">Item ...${item.data.slice(-10)} đã thất bại ${MAX_ITEM_RETRIES} lần và bị hủy.</span>`);
            await Item.findByIdAndUpdate(item._id, { status: 'failed' });
            await this.writeLog(item.orderId, item._id, 'ERROR', `Item đã thất bại sau ${MAX_ITEM_RETRIES} lần thử và bị hủy.`);
            await this.updateOrderProgress(item.orderId, 'failed', item);
            await this.refundUserForItem(item, `Item failed after ${MAX_ITEM_RETRIES} retries.`);
        }
    }

    async acquireAccount() {
        return Account.findOneAndUpdate(
            { status: 'LIVE', isDeleted: false },
            { $set: { status: 'IN_USE' } },
            { new: true, sort: { lastUsedAt: 1 } }
        );
    }
    
    async updateAccountOnFinish(account, wasSuccessful) {
        const update = {
            $inc: wasSuccessful ? { successCount: 1 } : { errorCount: 1 },
            $set: { lastUsedAt: new Date() }
        };
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

    async simulateLogin(item, account) {
        await this.writeLog(item.orderId, item._id, 'INFO', `Bắt đầu đăng nhập vào account ${account.uid}...`);
        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
        await this.writeLog(item.orderId, item._id, 'INFO', `Đăng nhập thành công account ${account.uid}.`);
    }
    
    async updateOrderProgress(orderId, lastItemStatus, item) {
        const updateField = lastItemStatus === 'completed' ? 'completedItems' : 'failedItems';
        
        const order = await Order.findByIdAndUpdate(orderId, 
            { $inc: { [updateField]: 1 } },
            { new: true }
        ).lean();

        if (!order) return;
        
        this.io.emit('order:item_update', {
            id: order._id.toString(),
            completedItems: order.completedItems,
            failedItems: order.failedItems,
            totalItems: order.totalItems,
            item: item // Gửi kèm thông tin item để cập nhật UI chi tiết
        });
        
        if ((order.completedItems + order.failedItems) >= order.totalItems) {
            await this.checkOrderCompletion(order);
        }
    }

    async refundUserForItem(item, reason) {
        try {
            const order = await Order.findById(item.orderId).lean();
            if (!order || !order.user) return;

            const refundAmount = order.pricePerItem;
            if (refundAmount <= 0) return;

            const updatedUser = await User.findByIdAndUpdate(
                order.user,
                { $inc: { balance: refundAmount } },
                { new: true }
            ).lean();

            if (!updatedUser) {
                await this.writeLog(item.orderId, item._id, 'ERROR', `Refund failed. User ${order.user} not found.`);
                return;
            }
            
            const originalBalance = updatedUser.balance - refundAmount;
            const logDetails = `Hoàn tiền ${refundAmount.toLocaleString('vi-VN')}đ cho user '${updatedUser.username}' do item trong đơn hàng #${order.shortId} thất bại. Lý do: ${reason}.`;

            await this.writeLog(item.orderId, item._id, 'INFO', `Hoàn ${refundAmount} cho user ${updatedUser.username}.`);
            await logActivity(updatedUser._id, 'ORDER_REFUND', {
                details: logDetails,
                context: 'System',
                metadata: {
                    balanceBefore: originalBalance,
                    balanceAfter: updatedUser.balance,
                    change: refundAmount
                }
            });

            this.addLogToUI(`💰 Hoàn tiền ${refundAmount.toLocaleString('vi-VN')}đ cho user <strong class="text-white">${updatedUser.username}</strong> (đơn hàng ...${order.shortId})`);
        } catch (e) {
            console.error(`[Refund] CRITICAL ERROR during refund for item ${item._id}:`, e);
            await this.writeLog(item.orderId, item._id, 'ERROR', `CRITICAL: Refund failed. Error: ${e.message}`);
        }
    }
    
    async checkOrderCompletion(order) {
        if (!order) return;
        const finalStatus = 'completed';
        
        await Order.findByIdAndUpdate(order._id, { status: finalStatus });
        this.io.emit('order:update', { id: order._id.toString(), status: finalStatus });
        
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
            await Log.create({ orderId, itemId, level, message });
        } catch (error) {
            console.error(`Failed to write log for item ${itemId}:`, error);
        }
    }
}

module.exports = new ItemProcessorManager();