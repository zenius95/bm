// utils/autoCheckManager.js
const Setting = require('../models/Setting');
const Account = require('../models/Account');
const { runCheckLive } = require('./checkLiveService');
const EventEmitter = require('events');

class AutoCheckManager extends EventEmitter {
    constructor() {
        super();
        this.io = null;
        this.timer = null;
        this.config = {
            isEnabled: false,
            intervalMinutes: 30
        };
        this.status = 'STOPPED'; // STOPPED, RUNNING, PENDING
        this.nextRun = null;
        this.isJobRunning = false;
    }

    async initialize(io) {
        this.io = io;
        console.log('🔄 Initializing Auto Check Manager...');
        const savedConfig = await Setting.get('autoCheckConfig', this.config);
        this.config = { ...this.config, ...savedConfig };

        if (this.config.isEnabled) {
            this.start();
        } else {
            this.emitStatus();
        }
    }

    async updateConfig(newConfig) {
        const wasEnabled = this.config.isEnabled;
        this.config = { ...this.config, ...newConfig };
        await Setting.set('autoCheckConfig', this.config);
        console.log(`[AutoCheck] Config updated: ${JSON.stringify(this.config)}`);

        if (wasEnabled) {
            this.restart();
        }
        this.emitStatus();
    }

    start() {
        if (this.timer) {
            console.log('[AutoCheck] Already running.');
            return;
        }
        this.config.isEnabled = true;
        Setting.set('autoCheckConfig', this.config);

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
                console.log(`[AutoCheck] Starting scheduled check at ${new Date().toLocaleTimeString()}`);
                await this.executeCheck();
            } catch(e) {
                console.error('[AutoCheck] Error during scheduled check:', e);
            } finally {
                this.isJobRunning = false;
            }
        };
        
        // Chạy ngay lần đầu, sau đó mới set interval
        runJob();
        this.timer = setInterval(runJob, intervalMs);

        this.updateNextRunTime();
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.config.isEnabled = false;
        Setting.set('autoCheckConfig', this.config);
        this.status = 'STOPPED';
        this.nextRun = null;
        console.log('[AutoCheck] Service stopped.');
        this.emitStatus();
    }

    restart() {
        console.log('[AutoCheck] Restarting service...');
        this.stop();
        // Dùng setTimeout để đảm bảo stop hoàn tất trước khi start
        setTimeout(() => this.start(), 100);
    }
    
    async executeCheck() {
        // Logic tìm account tương tự cronjob cũ
        const uncheckedAccounts = await Account.find({ status: 'UNCHECKED', isDeleted: { $ne: true } }).limit(50).lean();
        let accountsToCheck = [...uncheckedAccounts];
        const remainingLimit = 50 - uncheckedAccounts.length;

        if (remainingLimit > 0) {
            const otherAccounts = await Account.find({
                status: { $nin: ['UNCHECKED', 'CHECKING'] },
                isDeleted: { $ne: true }
            })
            .sort({ lastCheckedAt: 1 })
            .limit(remainingLimit)
            .lean();
            accountsToCheck.push(...otherAccounts);
        }

        if (accountsToCheck.length > 0) {
            const accountIds = accountsToCheck.map(acc => acc._id.toString());
            await runCheckLive(accountIds, this.io);
        } else {
            console.log('[AutoCheck] No accounts to check in this run.');
        }
        this.updateNextRunTime(); // Cập nhật lại thời gian chạy lần tới
    }

    updateNextRunTime() {
        if (this.status === 'RUNNING') {
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

// Export một instance duy nhất (singleton pattern)
module.exports = new AutoCheckManager();