// utils/autoCheckManager.js
const EventEmitter = require('events');
const Account = require('../models/Account');
const settingsService = require('../utils/settingsService');
const { runCheckLive } = require('../utils/checkLiveService');

const CHECK_INTERVAL = 60 * 1000; // 1 minute
const RESTING_PERIOD_HOURS = 24;
const PAUSE_WHEN_NO_ACCOUNTS = 15000; // ms, chờ 15s khi không có account để check
const PAUSE_BETWEEN_BATCHES = 5000; // ms, chờ 5s giữa các lượt

class AutoCheckManager extends EventEmitter {
    constructor() {
        super();
        this.io = null;
        this.loopTimeout = null; // Dùng để kiểm soát vòng lặp thay cho timer
        this.config = {};
        this.status = 'STOPPED';
        this.lastRun = null;
    }

    initialize(io) {
        this.io = io;
        console.log('🔄 Initializing Auto Check Manager...');
        this.config = settingsService.get('autoCheck');
        
        if (this.config.isEnabled) {
            this.start();
        } else {
            this.emitStatus();
        }
    }

    async updateConfig(newConfig) {
        const wasEnabled = this.config.isEnabled;
        this.config = { ...this.config, ...newConfig };
        
        await settingsService.update('autoCheck', this.config);
        console.log(`[AutoCheck] Config updated: ${JSON.stringify(this.config)}`);

        if (this.config.isEnabled && !wasEnabled) {
            this.start();
        } else if (!this.config.isEnabled && wasEnabled) {
            this.stop();
        }
        this.emitStatus();
    }
    
    start() {
        if (this.status === 'RUNNING') {
            console.log('[AutoCheck] Service is already running.');
            return;
        }
        console.log(`[AutoCheck] Service started. Running continuously.`);
        this.status = 'RUNNING';
        this.emitStatus();
        this.runLoop(); // Bắt đầu vòng lặp chính
    }
    
    stop() {
        this.status = 'STOPPED';
        if (this.loopTimeout) clearTimeout(this.loopTimeout);
        this.loopTimeout = null;
        console.log('[AutoCheck] Service stopped.');
        this.emitStatus();
    }

    async runLoop() {
        while (this.status === 'RUNNING') {
            try {
                const accountsProcessed = await this.executeCheck();
                
                if (accountsProcessed === 0) {
                    // Nếu không có account nào được xử lý, chờ một lúc trước khi thử lại
                    await new Promise(resolve => this.loopTimeout = setTimeout(resolve, PAUSE_WHEN_NO_ACCOUNTS));
                } else {
                    // Chờ một khoảng ngắn giữa các batch để giảm tải
                    await new Promise(resolve => this.loopTimeout = setTimeout(resolve, PAUSE_BETWEEN_BATCHES));
                }
            } catch (error) {
                console.error('[AutoCheck] Error in main loop:', error);
                // Chờ lâu hơn nếu có lỗi
                await new Promise(resolve => this.loopTimeout = setTimeout(resolve, 60000)); // Chờ 1 phút
            }
        }
    }

    async executeCheck() {
        console.log('[AutoCheck] Starting a new check cycle...');
        this.lastRun = new Date();
        this.emitStatus();

        try {
            // === START: THAY ĐỔI LOGIC LỰA CHỌN & ƯU TIÊN ===
            const { batchSize = 50, intervalMinutes = 10 } = this.config;
            const accountsToQueue = [];

            // 1. Tìm và "đánh thức" các tài khoản RESTING đủ điều kiện
            const restingTimeLimit = new Date(Date.now() - RESTING_PERIOD_HOURS * 60 * 60 * 1000);
            const readyToWakeAccounts = await Account.find({
                status: 'RESTING',
                lastUsedAt: { $lte: restingTimeLimit }
            }).select('_id').lean();

            if (readyToWakeAccounts.length > 0) {
                const idsToWake = readyToWakeAccounts.map(a => a._id);
                await Account.updateMany(
                    { _id: { $in: idsToWake } },
                    { $set: { status: 'UNCHECKED', successCount: 0, errorCount: 0 } }
                );
                console.log(`[AutoCheck] Woke up ${idsToWake.length} RESTING accounts.`);
            }

            // 2. Lấy tài khoản theo thứ tự ưu tiên mới
            // Ưu tiên 1: Lấy các tài khoản UNCHECKED (bao gồm cả các tài khoản vừa được đánh thức)
            const uncheckedAccounts = await Account.find({ status: 'UNCHECKED', isDeleted: false })
                .sort({ createdAt: 1 }) // Ưu tiên check acc cũ trước
                .limit(batchSize)
                .select('_id')
                .lean();
            
            accountsToQueue.push(...uncheckedAccounts.map(a => a._id));

            // Ưu tiên 2: Nếu chưa đủ batchSize, lấy các tài khoản còn lại theo ngưỡng thời gian
            if (accountsToQueue.length < batchSize) {
                const remainingLimit = batchSize - accountsToQueue.length;
                const priorityTimeLimit = new Date(Date.now() - intervalMinutes * 60 * 1000);
                
                const otherAccounts = await Account.find({
                    status: { $in: ['LIVE', 'DIE', 'ERROR'] },
                    isDeleted: false,
                    lastCheckedAt: { $lte: priorityTimeLimit } // Điều kiện ưu tiên
                })
                .sort({ lastCheckedAt: 1 }) // Sắp xếp từ cũ nhất -> mới nhất
                .limit(remainingLimit)
                .select('_id')
                .lean();

                accountsToQueue.push(...otherAccounts.map(a => a._id));
            }
            // === END: THAY ĐỔI LOGIC LỰA CHỌN & ƯU TIÊN ===

            if (accountsToQueue.length > 0) {
                console.log(`[AutoCheck] Queued ${accountsToQueue.length} accounts for checking.`);
                runCheckLive(accountsToQueue, this.io, {
                    concurrency: this.config.concurrency,
                    delay: this.config.delay,
                    timeout: this.config.timeout
                });
                return accountsToQueue.length;
            } else {
                console.log('[AutoCheck] No accounts to check in this cycle.');
                return 0;
            }
        } catch (error) {
            console.error('[AutoCheck] Error during execution:', error);
            return 0;
        }
    }

    getStatus() {
        return {
            status: this.status,
            config: this.config,
            lastRun: this.lastRun,
            nextRun: null // Bỏ nextRun vì service chạy liên tục
        };
    }

    emitStatus() {
        if (this.io) {
            this.io.emit('autoCheck:statusUpdate', this.getStatus());
        }
    }
}

module.exports = new AutoCheckManager();