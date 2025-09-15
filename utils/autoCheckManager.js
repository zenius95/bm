// utils/autoCheckManager.js
const settingsService = require('./settingsService'); // THAY ĐỔI
const Account = require('../models/Account');
const { runCheckLive } = require('./checkLiveService');
const EventEmitter = require('events');

class AutoCheckManager extends EventEmitter {
    constructor() {
        super();
        this.io = null;
        this.timer = null;
        this.config = {}; // Sẽ được load từ settingsService
        this.status = 'STOPPED';
        this.nextRun = null;
        this.isJobRunning = false;
    }

    // THAY ĐỔI: Hàm initialize giờ đơn giản hơn
    initialize(io) {
        this.io = io;
        console.log('🔄 Initializing Auto Check Manager...');
        this.config = settingsService.get('autoCheck', { isEnabled: false, intervalMinutes: 30 });

        if (this.config.isEnabled) {
            this.start();
        } else {
            this.emitStatus();
        }
    }

    // THAY ĐỔI: updateConfig giờ chỉ cần cập nhật settingsService
    async updateConfig(newConfig) {
        const oldConfig = { ...this.config };
        this.config = { ...this.config, ...newConfig };
        
        await settingsService.update('autoCheck', this.config);
        
        console.log(`[AutoCheck] Config updated: ${JSON.stringify(this.config)}`);

        const wasEnabled = oldConfig.isEnabled;
        const isNowEnabled = this.config.isEnabled;
        const intervalChanged = this.config.intervalMinutes !== oldConfig.intervalMinutes;

        if (wasEnabled && !isNowEnabled) this.stop();
        else if (!wasEnabled && isNowEnabled) this.start();
        else if (wasEnabled && isNowEnabled && intervalChanged) this.restart();
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
        // ... (logic executeCheck không thay đổi)
        const uncheckedAccounts = await Account.find({ status: 'UNCHECKED', isDeleted: { $ne: true } }).limit(50).lean();
        let accountsToCheck = [...uncheckedAccounts];
        const remainingLimit = 50 - uncheckedAccounts.length;
        if (remainingLimit > 0) {
            const otherAccounts = await Account.find({
                status: { $nin: ['UNCHECKED', 'CHECKING'] }, isDeleted: { $ne: true }
            }).sort({ lastCheckedAt: 1 }).limit(remainingLimit).lean();
            accountsToCheck.push(...otherAccounts);
        }
        if (accountsToCheck.length > 0) {
            await runCheckLive(accountsToCheck.map(a => a._id.toString()), this.io);
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