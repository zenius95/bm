// utils/itemProcessorManager.js
const EventEmitter = require('events');
const settingsService = require('./settingsService');
const Order = require('../models/Order');
const Item = require('../models/Item');
const Account = require('../models/Account');
const Log = require('../models/Log');
const User = require('../models/User'); 
const { logActivity } = require('./activityLogService');

// --- Hằng số cấu hình ---
const ITEMS_PER_ACCOUNT_SESSION = 4; // Mỗi account sẽ xử lý 4 item mỗi lần
const DELAY_BETWEEN_TASKS = 500; // ms, delay nhẹ giữa các item

class ItemProcessorManager extends EventEmitter {
    constructor() {
        super();
        this.io = null;
        this.timer = null;
        this.config = {};
        this.status = 'STOPPED';
        this.activeWorkers = 0; // Số luồng đang hoạt động
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

        // Khởi động lại nếu cấu hình concurrency thay đổi để áp dụng số luồng mới
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

    /**
     * "Sinh" ra các worker (luồng xử lý) mới nếu còn chỗ trống.
     */
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
                // Thử spawn ngay một worker khác để lấp chỗ trống
                this.spawnWorkers();
            });
        }
        this.emitStatus();
    }
    
    /**
     * Logic chính cho một phiên làm việc của worker.
     */
    async runWorkerSession() {
        // 1. Tìm và "khóa" một account
        const account = await this.acquireAccount();
        if (!account) {
            this.addLogToUI('Không tìm thấy account nào khả dụng để xử lý.');
            return;
        }

        this.addLogToUI(`Worker bắt đầu phiên làm việc với account <strong class="text-green-400">${account.uid}</strong>.`);

        try {
            // Giả lập quá trình đăng nhập
            await this.simulateLogin(account);

            // 2. Lấy một batch item để xử lý
            const items = await this.acquireItems(ITEMS_PER_ACCOUNT_SESSION);
            if (items.length === 0) {
                this.addLogToUI('Không có item nào đang chờ xử lý.');
                return; // Kết thúc phiên nếu không có việc
            }

            this.addLogToUI(`Account <strong class="text-green-400">${account.uid}</strong> đã nhận <strong class="text-yellow-400">${items.length}</strong> item để xử lý.`);

            // 3. Xử lý lần lượt từng item
            for (const item of items) {
                await this.processSingleItem(item, account);
                await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_TASKS));
            }
        } finally {
            // 4. Luôn phải giải phóng account sau khi kết thúc phiên
            await this.releaseAccount(account);
            this.addLogToUI(`Account <strong class="text-green-400">${account.uid}</strong> đã được giải phóng.`);
        }
    }
    
    async acquireAccount() {
        // Tìm một account LIVE, chưa được gán, và được check gần đây nhất,
        // sau đó cập nhật ngay trạng thái thành IN_USE để "khóa" nó lại.
        return Account.findOneAndUpdate(
            { status: 'LIVE', isDeleted: false },
            { $set: { status: 'IN_USE' } },
            { new: true, sort: { lastCheckedAt: -1 } }
        );
    }

    async releaseAccount(account) {
        return Account.findByIdAndUpdate(account._id, { $set: { status: 'LIVE' } });
    }
    
    async acquireItems(limit) {
         const items = await Item.find({ status: 'queued' })
            .sort({ createdAt: 1 })
            .limit(limit)
            .lean();
        
        if (items.length > 0) {
            const itemIds = items.map(i => i._id);
            // Cập nhật trạng thái của các item đã lấy thành 'processing'
            await Item.updateMany({ _id: { $in: itemIds } }, { $set: { status: 'processing' } });
        }
        return items;
    }

    async simulateLogin(account) {
        // Giả lập thời gian đăng nhập
        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
        console.log(`[Worker] Simulated login for account ${account.uid}`);
    }

    async processSingleItem(item, account) {
        try {
            this.addLogToUI(`> Account <strong class="text-green-400">${account.uid}</strong> đang xử lý item ...${item.shortId}`);
            await this.writeLog(item.orderId, 'INFO', `Account ${account.uid} started processing item ${item.shortId}. Data: "${item.data}"`);
            
            // Giả lập thời gian xử lý
            await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));

            if (item.data.trim().toLowerCase() === 'lỗi') {
                throw new Error("Giả lập lỗi xử lý item.");
            }
            
            // Cập nhật item thành 'completed'
            const updatedItem = await Item.findByIdAndUpdate(item._id, { 
                status: 'completed',
                processedBy: this.config.workerId, // Gán workerId nếu có
                processedWith: account._id
            }, { new: true });

            await this.writeLog(item.orderId, 'INFO', `Item ${item.shortId} completed successfully.`);
            this.addLogToUI(`✔ Hoàn thành item ...${item.shortId}`);
    
            await this.updateOrderProgress(item.orderId, 'completed');

        } catch(error) {
            console.error(`[Worker] Error processing item ${item.shortId}:`, error);

            const updatedItem = await Item.findByIdAndUpdate(item._id, { 
                status: 'failed',
                processedBy: this.config.workerId,
                processedWith: account._id
            }, { new: true });

            await this.writeLog(item.orderId, 'ERROR', `Item ${item.shortId} failed. Error: ${error.message}`);
            this.addLogToUI(`<span class="text-red-400">✘ Thất bại item ...${item.shortId}</span>`);
            
            await this.updateOrderProgress(item.orderId, 'failed');
            await this.refundUserForItem(item.orderId, error.message);
        }
    }
    
    async updateOrderProgress(orderId, lastItemStatus) {
        const updateField = lastItemStatus === 'completed' ? 'completedItems' : 'failedItems';
        
        const order = await Order.findByIdAndUpdate(orderId, 
            { $inc: { [updateField]: 1 } },
            { new: true }
        ).lean();

        if (!order) return;
        
        // Gửi update tiến độ qua socket
        this.io.emit('order:item_update', {
            id: order._id.toString(),
            completedItems: order.completedItems,
            failedItems: order.failedItems,
            totalItems: order.totalItems
        });
        
        // Kiểm tra xem đơn hàng đã hoàn thành chưa
        if ((order.completedItems + order.failedItems) >= order.totalItems) {
            await this.checkOrderCompletion(order);
        }
    }

    async refundUserForItem(orderId, reason) {
        try {
            const order = await Order.findById(orderId).lean();
            if (!order || !order.user) return;

            const refundAmount = order.pricePerItem;
            if (refundAmount <= 0) return;

            const updatedUser = await User.findByIdAndUpdate(
                order.user,
                { $inc: { balance: refundAmount } },
                { new: true }
            ).lean();

            if (!updatedUser) {
                await this.writeLog(orderId, 'ERROR', `Refund failed. User ${order.user} not found.`);
                return;
            }
            
            const originalBalance = updatedUser.balance - refundAmount;
            const logDetails = `Hoàn tiền ${refundAmount.toLocaleString('vi-VN')}đ cho user '${updatedUser.username}' do item trong đơn hàng #${order.shortId} thất bại. Lý do: ${reason}.`;

            await this.writeLog(orderId, 'INFO', `Refunded ${refundAmount} to user ${updatedUser.username}.`);
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
            console.error(`[Refund] CRITICAL ERROR during refund for order ${orderId}:`, e);
            await this.writeLog(orderId, 'ERROR', `CRITICAL: Refund failed. Error: ${e.message}`);
        }
    }
    
    async checkOrderCompletion(order) {
        if (!order) return;
        
        const finalStatus = 'completed'; // Đơn hàng luôn là completed khi không còn item chờ
        
        await Order.findByIdAndUpdate(order._id, { status: finalStatus });
        this.io.emit('order:update', { id: order._id.toString(), status: finalStatus });
        
        // Cập nhật lại thống kê trên Dashboard
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
        await this.writeLog(order._id, 'INFO', `Order has been fully processed with final status: ${finalStatus}.`);
    }

    getStatus() {
        return {
            status: this.status,
            config: this.config,
            activeTasks: this.activeWorkers,
            queuedTasks: 0, // Sẽ cần logic mới để đếm item chờ nếu cần
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

    async writeLog(orderId, level, message) {
        try {
            await Log.create({ orderId, level, message });
        } catch (error) {
            console.error(`Failed to write log for order ${orderId}:`, error);
        }
    }
}

module.exports = new ItemProcessorManager();