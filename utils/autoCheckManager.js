// utils/autoCheckManager.js
const EventEmitter = require('events');
const Account = require('../models/Account');
const settingsService = require('../utils/settingsService');
const { runCheckLive } = require('../utils/checkLiveService');

const CHECK_INTERVAL = 60 * 1000; // 1 minute
const RESTING_PERIOD_HOURS = 24;

class AutoCheckManager extends EventEmitter {
    constructor() {
        super();
        this.io = null;
        this.timer = null;
        this.config = {};
        this.status = 'STOPPED';
        this.lastRun = null;
        this.nextRun = null;
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
        if (this.timer) {
            console.log('[AutoCheck] Service is already running.');
            return;
        }
        const intervalMs = this.config.intervalMinutes * 60 * 1000;
        console.log(`[AutoCheck] Service started. Running every ${this.config.intervalMinutes} minutes.`);
        this.status = 'RUNNING';
        this.nextRun = new Date(Date.now() + intervalMs);

        this.timer = setInterval(() => this.executeCheck(), intervalMs);
        this.emitStatus();
    }
    
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.status = 'STOPPED';
        this.lastRun = null;
        this.nextRun = null;
        console.log('[AutoCheck] Service stopped.');
        this.emitStatus();
    }

    async executeCheck() {
        console.log('[AutoCheck] Starting scheduled check...');
        this.lastRun = new Date();
        const intervalMs = this.config.intervalMinutes * 60 * 1000;
        this.nextRun = new Date(Date.now() + intervalMs);
        this.emitStatus();

        try {
            // === START: THAY ĐỔI LOGIC LỰA CHỌN & ƯU TIÊN ===
            const { batchSize = 50 } = this.config;
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

            // Ưu tiên 2: Nếu chưa đủ batchSize, lấy các tài khoản còn lại
            if (accountsToQueue.length < batchSize) {
                const remainingLimit = batchSize - accountsToQueue.length;
                const otherAccounts = await Account.find({
                    status: { $in: ['LIVE', 'DIE', 'ERROR'] },
                    isDeleted: false
                })
                .sort({ lastCheckedAt: 1 }) // Ưu tiên check acc lâu chưa check nhất
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
            } else {
                console.log('[AutoCheck] No accounts to check in this run.');
            }
        } catch (error) {
            console.error('[AutoCheck] Error during execution:', error);
        }
    }

    getStatus() {
        return {
            status: this.status,
            config: this.config,
            lastRun: this.lastRun,
            nextRun: this.nextRun
        };
    }

    emitStatus() {
        if (this.io) {
            this.io.emit('autoCheck:statusUpdate', this.getStatus());
        }
    }
}

module.exports = new AutoCheckManager();