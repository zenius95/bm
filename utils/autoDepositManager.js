// utils/autoDepositManager.js
const settingsService = require('./settingsService');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const fetch = require('node-fetch');
const { logActivity } = require('./activityLogService');
const EventEmitter = require('events');

class AutoDepositManager extends EventEmitter {
    constructor() {
        super();
        this.io = null;
        this.timer = null;
        this.config = {};
        this.status = 'STOPPED';
        this.nextRun = null;
        this.isJobRunning = false;
        this.logs = [];
    }

    initialize(io) {
        this.io = io;
        console.log('🔄 Initializing Auto Deposit Manager...');
        this.config = settingsService.get('autoDeposit');
        this.emitStatus();
    }

    async updateConfig(newConfig) {
        const oldConfig = { ...this.config };
        this.config = { ...this.config, ...newConfig };
        
        await settingsService.update('autoDeposit', this.config);
        
        this.addLog(`Cấu hình đã được cập nhật.`);

        const wasEnabled = oldConfig.isEnabled;
        const isNowEnabled = this.config.isEnabled;
        const settingsChanged = this.config.intervalMinutes !== oldConfig.intervalMinutes || this.config.apiKey !== oldConfig.apiKey || this.config.prefix !== oldConfig.prefix;

        if (wasEnabled && !isNowEnabled) this.stop();
        else if (!wasEnabled && isNowEnabled) this.start();
        else if (wasEnabled && isNowEnabled && settingsChanged) this.restart();
        else this.emitStatus();
    }

    start() {
        if (!this.config.apiKey) {
            this.addLog('<span class="text-red-400">Không thể bắt đầu: API Key ngân hàng chưa được thiết lập.</span>');
            this.config.isEnabled = false;
            this.emitStatus();
            return;
        }
        if (this.timer) clearInterval(this.timer);
        
        const intervalMs = this.config.intervalMinutes * 60 * 1000;
        this.addLog(`<span class="text-green-400">Dịch vụ đã bắt đầu. Kiểm tra mỗi ${this.config.intervalMinutes} phút.</span>`);
        this.status = 'RUNNING';
        
        const runJob = async () => {
            if (this.isJobRunning) {
                this.addLog('Một phiên kiểm tra đang chạy, bỏ qua lần này.');
                return;
            }
            try {
                this.isJobRunning = true;
                this.emitStatus();
                await this.executeCheck();
            } catch(e) {
                this.addLog(`<span class="text-red-400">Lỗi trong quá trình kiểm tra: ${e.message}</span>`);
                console.error('[AutoDeposit] Error during scheduled check:', e);
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
        this.addLog('<span class="text-yellow-400">Dịch vụ đã dừng.</span>');
        this.emitStatus();
    }

    restart() {
        this.addLog('Khởi động lại dịch vụ...');
        this.stop();
        setTimeout(() => this.start(), 200);
    }
    
    async executeCheck() {
        this.addLog('Bắt đầu quét lịch sử giao dịch...');
        try {
            const response = await fetch(`https://api.web2m.com/historyapiopenbidvv3/${this.config.apiKey}`);
            if (!response.ok) {
                throw new Error(`API trả về lỗi: ${response.status} ${response.statusText}`);
            }
            const result = await response.json();

            if (!result || !result.transactions || !Array.isArray(result.transactions)) {
                this.addLog('<span class="text-yellow-400">API không trả về dữ liệu giao dịch hợp lệ.</span>');
                return;
            }
            
            this.addLog(`Tìm thấy ${result.transactions.length} giao dịch mới.`);

            for (const transaction of result.transactions) {
                await this.processTransaction(transaction);
            }
            this.addLog('Hoàn thành quét.');
        } catch (error) {
            this.addLog(`<span class="text-red-400">Lỗi khi gọi API ngân hàng: ${error.message}</span>`);
            console.error('[AutoDeposit] Fetch API error:', error);
        }
    }

    async processTransaction(transaction) {
        const { transactionID, description, amount } = transaction;
        const prefix = this.config.prefix.toUpperCase();

        if (!description.toUpperCase().startsWith(prefix)) return;

        const username = description.substring(prefix.length).trim().toLowerCase();
        if (!username) return;

        const existingLog = await ActivityLog.findOne({ 'metadata.tid': transactionID });
        if (existingLog) return;
        
        const user = await User.findOne({ username: username });
        if (!user) {
            this.addLog(`<span class="text-yellow-400">Giao dịch #${transactionID}: Không tìm thấy user '${username}'.</span>`);
            return;
        }

        const balanceBefore = user.balance;
        user.balance += amount;
        await user.save();
        
        await logActivity(user._id, 'CLIENT_DEPOSIT_AUTO', {
            details: `Nạp tiền tự động qua ngân hàng. Giao dịch #${transactionID}.`,
            ipAddress: 'SYSTEM',
            context: 'Admin',
            metadata: {
                balanceBefore: balanceBefore,
                balanceAfter: user.balance,
                change: amount,
                tid: transactionID,
                description: description
            }
        });

        this.addLog(`<span class="text-green-400">Thành công!</span> Cộng ${amount.toLocaleString('vi-VN')}đ cho user <strong class="text-white">${user.username}</strong> (GD: #${transactionID})`);
    }
    
    addLog(message) {
        const logEntry = {
            timestamp: new Date(),
            message: message
        };
        this.logs.unshift(logEntry);
        if (this.logs.length > 100) {
            this.logs.pop();
        }
        if (this.io) {
            this.io.emit('autoDeposit:log', logEntry);
        }
    }

    getLogs() {
        return this.logs;
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
            this.io.emit('autoDeposit:statusUpdate', this.getStatus());
        }
    }
}

module.exports = new AutoDepositManager();