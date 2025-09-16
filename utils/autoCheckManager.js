// utils/autoCheckManager.js
const settingsService = require('./settingsService');
const Account = require('../models/Account');
const { runCheckLive } = require('./checkLiveService');
const EventEmitter = require('events');

class AutoCheckManager extends EventEmitter {
    constructor() {
        super();
        this.io = null;
        this.timer = null;
        this.config = {};
        this.status = 'STOPPED';
        this.nextRun = null;
        this.isJobRunning = false;
    }

    initialize(io) {
        this.io = io;
        console.log('🔄 Initializing Auto Check Manager...');
        this.config = settingsService.get('autoCheck');
        this.emitStatus();
    }

    async updateConfig(newConfig) {
        const oldConfig = { ...this.config };
        this.config = { ...this.config, ...newConfig };
        
        await settingsService.update('autoCheck', this.config);
        
        console.log(`[AutoCheck] Config updated: ${JSON.stringify(this.config)}`);

        const wasEnabled = oldConfig.isEnabled;
        const isNowEnabled = this.config.isEnabled;
        
        const settingsChanged = this.config.intervalMinutes !== oldConfig.intervalMinutes ||
                                this.config.concurrency !== oldConfig.concurrency ||
                                this.config.delay !== oldConfig.delay ||
                                this.config.timeout !== oldConfig.timeout ||
                                this.config.batchSize !== oldConfig.batchSize;

        if (wasEnabled && !isNowEnabled) this.stop();
        else if (!wasEnabled && isNowEnabled) this.start();
        else if (wasEnabled && isNowEnabled && settingsChanged) this.restart();
        else this.emitStatus();
    }

    start() {
        if (this.timer) clearInterval(this.timer);
        
        const intervalMs = this.config.intervalMinutes * 60 * 1000;
        console.log(`[AutoCheck] Service started. Interval: ${this.config.intervalMinutes} minutes.`);
        this.status = 'RUNNING';
        
        const runJob = async () => {
            if (this.isJobRunning) {
                console.log('[AutoCheck] A check is already in progress. Skipping this run.');
                return;
            }
            try {
                this.isJobRunning = true;
                this.emitStatus();
                await this.executeCheck();
            } catch(e) {
                console.error('[AutoCheck] Error during scheduled check:', e);
            } finally {
                this.isJobRunning = false;
                this.updateNextRunTime();
            }
        };
        
        runJob();
        this.timer = setInterval(runJob, intervalMs);
        this.updateNextRunTime();
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.status = 'STOPPED';
        this.nextRun = null;
        console.log('[AutoCheck] Service stopped.');
        this.emitStatus();
    }

    restart() {
        console.log('[AutoCheck] Restarting service...');
        this.stop();
        setTimeout(() => this.start(), 200);
    }
    
    async executeCheck() {
        const batchSize = parseInt(this.config.batchSize, 10) || 50;
        
        // Bước 1: "Đánh thức" các account đang nghỉ và chuyển về UNCHECKED
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const restedAccounts = await Account.updateMany(
            { 
                status: 'RESTING', 
                lastUsedAt: { $lte: twentyFourHoursAgo },
                isDeleted: false
            },
            {
                $set: {
                    status: 'UNCHECKED', // Chuyển về UNCHECKED để buộc phải check lại
                    successCount: 0,
                    errorCount: 0,
                    lastCheckedAt: null // Reset lastCheckedAt để đảm bảo được ưu tiên
                }
            }
        );
        if (restedAccounts.modifiedCount > 0) {
            console.log(`[AutoCheck] Resurrected and reset ${restedAccounts.modifiedCount} RESTING accounts to UNCHECKED.`);
        }
        
        let accountsToCheck = [];

        // Bước 2: Ưu tiên lấy các account UNCHECKED
        const uncheckedAccounts = await Account.find({ status: 'UNCHECKED', isDeleted: { $ne: true } }).limit(batchSize).lean();
        accountsToCheck.push(...uncheckedAccounts);

        const remainingLimit = batchSize - accountsToCheck.length;

        // Bước 3: Nếu còn chỗ, lấy các account LIVE (ưu tiên check cũ nhất trước)
        if (remainingLimit > 0) {
            const liveAccounts = await Account.find({
                status: 'LIVE', isDeleted: { $ne: true }
            }).sort({ lastCheckedAt: 1 }).limit(remainingLimit).lean(); // Sắp xếp tăng dần (cũ nhất trước)
            accountsToCheck.push(...liveAccounts);
        }

        if (accountsToCheck.length > 0) {
            const accountIds = accountsToCheck.map(acc => acc._id.toString());
            console.log(`[AutoCheck] Found ${accountIds.length} accounts to check.`);
            await runCheckLive(accountIds, this.io, {
                concurrency: this.config.concurrency,
                delay: this.config.delay,
                timeout: this.config.timeout
            });
        } else {
            console.log('[AutoCheck] No accounts to check in this run.');
        }
    }
    
    updateNextRunTime() { 
        if (this.status === 'RUNNING' && this.timer) {
            const intervalMs = this.config.intervalMinutes * 60 * 1000;
            this.nextRun = new Date(Date.now() + intervalMs);
        } else {
            this.nextRun = null;
        }
        this.emitStatus();
    }
    
    getStatus() { 
        return {
            status: this.status,
            config: this.config,
            nextRun: this.nextRun ? this.nextRun.toISOString() : null,
            isJobRunning: this.isJobRunning,
        };
    }

    emitStatus() { 
        if (this.io) {
            this.io.emit('autoCheck:statusUpdate', this.getStatus());
        }
    }
}

module.exports = new AutoCheckManager();