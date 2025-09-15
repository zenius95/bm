// utils/autoCheckManager.js
const fs = require('fs').promises;
const path = require('path');
const Account = require('../models/Account');
const { runCheckLive } = require('./checkLiveService');
const EventEmitter = require('events');

const SETTINGS_FILE_PATH = path.join(__dirname, '..', 'settings.json');

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

    async _loadConfig() {
        try {
            const data = await fs.readFile(SETTINGS_FILE_PATH, 'utf-8');
            console.log('[AutoCheck] Loaded config from settings.json');
            return JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') { // File not found
                console.log('[AutoCheck] settings.json not found. Using and creating default config.');
                await this._saveConfig(); // Tạo file với config mặc định
                return this.config;
            }
            console.error('[AutoCheck] Error reading settings.json:', error);
            return this.config; // Trả về default nếu có lỗi khác
        }
    }

    async _saveConfig() {
        try {
            await fs.writeFile(SETTINGS_FILE_PATH, JSON.stringify(this.config, null, 4));
        } catch (error) {
            console.error('[AutoCheck] Failed to save settings.json:', error);
        }
    }

    async initialize(io) {
        this.io = io;
        console.log('🔄 Initializing Auto Check Manager...');
        const savedConfig = await this._loadConfig();
        this.config = { ...this.config, ...savedConfig };

        if (this.config.isEnabled) {
            this.start();
        } else {
            this.emitStatus();
        }
    }
    
    async updateConfig(newConfig) {
        const wasEnabled = this.config.isEnabled;
        const oldInterval = this.config.intervalMinutes;

        this.config = { ...this.config, ...newConfig };
        await this._saveConfig();
        console.log(`[AutoCheck] Config updated: ${JSON.stringify(this.config)}`);

        const isNowEnabled = this.config.isEnabled;
        const intervalChanged = this.config.intervalMinutes !== oldInterval;

        if (wasEnabled && !isNowEnabled) {
            this.stop();
        } else if (!wasEnabled && isNowEnabled) {
            this.start();
        } else if (wasEnabled && isNowEnabled && intervalChanged) {
            this.restart();
        } else {
            this.emitStatus();
        }
    }

    async start() {
        if (this.timer) {
            clearInterval(this.timer);
        }
        
        this.config.isEnabled = true;
        await this._saveConfig();
        
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
                console.log(`[AutoCheck] Starting scheduled check at ${new Date().toLocaleTimeString()}`);
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

    async stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.config.isEnabled = false;
        await this._saveConfig();
        this.status = 'STOPPED';
        this.nextRun = null;
        console.log('[AutoCheck] Service stopped.');
        this.emitStatus();
    }

    restart() {
        console.log('[AutoCheck] Restarting service...');
        // Stop không cần save config vì start ngay sau đó sẽ làm
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.status = 'STOPPED';
        this.nextRun = null;
        
        setTimeout(() => this.start(), 200);
    }
    
    async executeCheck() {
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