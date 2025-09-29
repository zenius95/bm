// utils/itemProcessorManager.js
const EventEmitter = require('events');
const settingsService = require('./settingsService');
const Order = require('../models/Order');
const Item = require('../models/Item');
const Account = require('../models/Account');
const Log = require('../models/Log');
const { runAppealProcess } = require('../insta/runInsta');
const ProcessRunner = require('./processRunner');

// --- Hằng số cấu hình ---
const MAX_ITEM_RETRIES = 3;
const DELAY_BETWEEN_ACCOUNTS = 1000;
const SIMULATION_KEYWORDS = ['success', 'error'];

class ItemProcessorManager extends EventEmitter {
    constructor() {
        super();
        this.io = null;
        this.timer = null;
        this.isProcessingBatch = false;
        // <<< START: THÊM THUỘC TÍNH THEO DÕI TRẠNG THÁI >>>
        this.activeTasks = 0;
        this.queuedTasks = 0;
        // <<< END: THÊM THUỘC TÍNH THEO DÕI TRẠNG THÁI >>>
    }

    initialize(io) {
        this.io = io;
        console.log('🔄 Initializing Item Processor Manager (Autonomous Mode)...');
        this.start();
    }
    
    async updateConfig(newConfig) {
        await settingsService.update('itemProcessor', newConfig);
        console.log(`[ItemProcessor] Config updated.`);
        this.emitStatus();
    }

    start() {
        if (this.timer) clearInterval(this.timer);
        const intervalMs = (settingsService.get('itemProcessor')?.pollingInterval || 5) * 1000;
        console.log(`[ItemProcessor] Service started. Polling every ${intervalMs / 1000}s.`);
        
        this.timer = setInterval(() => this.processQueuedItems(), intervalMs);
        this.processQueuedItems(); // Run immediately on start
    }

    stop() {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        console.log('[ItemProcessor] Service stopped.');
    }

    // <<< START: THÊM HÀM GETSTATUS VÀ EMITSTATUS >>>
    /**
     * Lấy trạng thái hiện tại của tiến trình.
     * @returns {{activeTasks: number, queuedTasks: number}}
     */
    getStatus() {
        return {
            activeTasks: this.activeTasks,
            queuedTasks: this.queuedTasks,
        };
    }

    emitStatus() {
        if (this.io) {
            this.io.emit('itemProcessor:statusUpdate', this.getStatus());
        }
    }
    // <<< END: THÊM HÀM GETSTATUS VÀ EMITSTATUS >>>

    async processQueuedItems() {
        if (this.isProcessingBatch) return;

        this.isProcessingBatch = true;
        try {
            const currentConfig = settingsService.get('itemProcessor');
            const maxConcurrency = currentConfig.concurrency || 10;
            const itemProcessingTimeout = currentConfig.timeout || 180000;
            
            // Cập nhật số lượng item trong hàng đợi
            this.queuedTasks = await Item.countDocuments({ status: 'queued' });

            const items = await Item.find({ status: 'queued' })
                                    .sort({ createdAt: 1 })
                                    .limit(maxConcurrency)
                                    .lean();
            
            if (items.length === 0) {
                this.activeTasks = 0;
                this.emitStatus();
                return;
            }
            
            console.log(`[ItemProcessor] Found ${items.length} items to process.`);
            this.activeTasks = items.length;
            this.emitStatus();
            
            const itemIds = items.map(i => i._id);
            await Item.updateMany({ _id: { $in: itemIds } }, { $set: { status: 'processing' } });

            const orderIds = [...new Set(items.map(i => i.orderId.toString()))];
            await Order.updateMany({ _id: { $in: orderIds }, status: 'pending' }, { $set: { status: 'processing' } });
            
            const runner = new ProcessRunner({
                concurrency: maxConcurrency,
                timeout: itemProcessingTimeout,
            });

            const tasks = items.map(item => ({
                id: item._id.toString(),
                task: () => this.runSingleItemTask(item)
            }));

            runner.addTasks(tasks);

            runner.on('task:complete', async ({ result }) => {
                const { account } = result;
                await this.updateAccountOnFinish(account, true);
            });

            runner.on('task:error', async ({ error, taskWrapper }) => {
                const item = await Item.findById(taskWrapper.id);
                if (!item) return;

                if (error.lastUsedAccount) {
                    await this.updateAccountOnFinish(error.lastUsedAccount, false);
                }
                
                console.error(`[ItemProcessor] Task for item ${item._id} failed: ${error.message}`);
                await this.writeLog(item.orderId, item._id, 'ERROR', `Xử lý thất bại: ${error.message}`);
                item.status = 'failed';
                await item.save();
            });
            
            runner.on('end', async () => {
                // Khi một lô hoàn thành, cập nhật lại trạng thái
                this.activeTasks = 0;
                this.queuedTasks = await Item.countDocuments({ status: 'queued' });
                this.emitStatus();
            });

            runner.start();

        } catch (err) {
            console.error('[ItemProcessor] Critical error during item processing batch:', err);
            this.activeTasks = 0; // Reset on critical error
            this.emitStatus();
        } finally {
            this.isProcessingBatch = false;
        }
    }
    
    async runSingleItemTask(item) {
        const bmIdMatch = item.data.trim().match(/^\d+$/);
        const bmId = bmIdMatch ? bmIdMatch[0] : null;

        if (!bmId) {
            throw new Error(`BM ID "${item.data}" không hợp lệ.`);
        }

        if (SIMULATION_KEYWORDS.includes(item.data.toLowerCase().trim())) {
             await new Promise(resolve => setTimeout(resolve, 2000));
            if (item.data.toLowerCase().trim() === 'success') {
                await Item.findByIdAndUpdate(item._id, { status: 'completed' });
                return { item, account: null };
            } else {
                throw new Error("Item giả lập thất bại.");
            }
        }

        let success = false;
        let attemptCount = 0;
        const usedAccountIds = [];
        let finalAccount = null;
        let lastUsedAccount = null;

        while (attemptCount < MAX_ITEM_RETRIES && !success) {
            attemptCount++;
            const account = await this.acquireAccount(usedAccountIds);
            lastUsedAccount = account;
            
            if (!account) {
                await this.writeLog(item.orderId, item._id, 'ERROR', `Hết account khả dụng (lần thử ${attemptCount}).`);
                await new Promise(resolve => setTimeout(resolve, 5000));
                continue;
            }
            
            usedAccountIds.push(account._id);

            const logCallback = (message) => {
                this.writeLog(item.orderId, item._id, 'INFO', `[${account.uid}] ${message}`);
            };

            try {
                const result = await runAppealProcess(account, bmId, logCallback);
                
                if (result === true) {
                    await Item.findByIdAndUpdate(item._id, { status: 'completed', processedWith: account._id });
                    success = true;
                    finalAccount = account;
                } else {
                    throw new Error("Quy trình kháng không hoàn tất.");
                }

            } catch (error) {
                await this.writeLog(item.orderId, item._id, 'ERROR', `Lỗi với account ${account.uid}: ${error.message}`);
                await this.updateAccountOnFinish(account, false);
                await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_ACCOUNTS));
            }
        }

        if (success) {
            return { item, account: finalAccount };
        } else {
            const finalError = new Error(`Item thất bại sau ${MAX_ITEM_RETRIES} lần thử.`);
            finalError.lastUsedAccount = lastUsedAccount;
            throw finalError;
        }
    }

    async acquireAccount(excludeIds = []) {
        return Account.findOneAndUpdate(
            { status: 'LIVE', isDeleted: false, _id: { $nin: excludeIds } },
            { $set: { status: 'IN_USE' } },
            { new: true, sort: { lastUsedAt: 1 } }
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
        } else {
            updatedAccount.status = 'LIVE';
        }
        
        await updatedAccount.save();
        return updatedAccount;
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