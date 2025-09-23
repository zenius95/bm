// utils/autoCheckManager.js
const EventEmitter = require('events');
const Account = require('../models/Account');
const settingsService = require('../utils/settingsService');
const { runCheckLive } = require('../utils/checkLiveService');
const fs = require('fs').promises;
const path = require('path');

const CHECK_INTERVAL = 60 * 1000; // 1 minute
const RESTING_PERIOD_HOURS = 24;
const PAUSE_WHEN_NO_ACCOUNTS = 15000; // ms, chờ 15s khi không có account để check
const PAUSE_BETWEEN_BATCHES = 5000; // ms, chờ 5s giữa các lượt
const LOG_FILE = path.join(__dirname, '..', 'logs', 'autocheck-log.txt');

class AutoCheckManager extends EventEmitter {
    constructor() {
        super();
        this.io = null;
        this.loopTimeout = null;
        this.config = {};
        this.status = 'STOPPED';
        this.lastRun = null;
        this.logs = [];
    }
    
    async readLogFile() {
        try {
            const data = await fs.readFile(LOG_FILE, 'utf8');
            const lines = data.split('\n').filter(line => line.trim() !== '');
            return lines.map(line => {
                const match = line.match(/^\[(.*?)\]\s*(.*)$/);
                if (match) {
                    const [datePart, timePart] = match[1].split(', ');
                    const [day, month, year] = datePart.split('/');
                    const isoTimestamp = `${year}-${month}-${day}T${timePart}`;
                    return { timestamp: new Date(isoTimestamp), message: match[2] };
                }
                return { timestamp: new Date(), message: line };
            }).reverse();
        } catch (error) {
            if (error.code === 'ENOENT') return [];
            console.error('Lỗi khi đọc file autocheck log:', error);
            return [];
        }
    }

    async initialize(io) {
        this.io = io;
        console.log('🔄 Initializing Auto Check Manager...');
        this.config = settingsService.get('autoCheck');
        await fs.mkdir(path.dirname(LOG_FILE), { recursive: true });
        this.logs = await this.readLogFile();
        if (this.config.isEnabled) {
            this.start();
        } else {
            this.emitStatus();
        }
    }
    
    addLog(message) {
        const logEntry = {
            timestamp: new Date(),
            message: message
        };
        this.logs.unshift(logEntry);
        if (this.io) this.io.emit('autoCheck:log', logEntry);
        // Ghi vào file
        const fileLogMessage = `[${logEntry.timestamp.toLocaleString('vi-VN')}] ${message.replace(/<[^>]*>/g, '')}\n`;
        fs.appendFile(LOG_FILE, fileLogMessage).catch(err => console.error('Failed to write to autocheck log file:', err));
    }
    
    async clearLogs() {
        this.logs = [];
        try {
            await fs.writeFile(LOG_FILE, ''); // Ghi đè file
        } catch (err) {
            console.error('Failed to clear autocheck log file:', err);
        }
    }
    
    getLogs() {
        return this.logs;
    }


    async updateConfig(newConfig) {
        const wasEnabled = this.config.isEnabled;
        this.config = { ...this.config, ...newConfig };
        
        await settingsService.update('autoCheck', this.config);
        this.addLog(`Cấu hình đã được cập nhật.`);

        if (this.config.isEnabled && !wasEnabled) {
            this.start();
        } else if (!this.config.isEnabled && wasEnabled) {
            this.stop();
        }
        this.emitStatus();
    }
    
    start() {
        if (this.status === 'RUNNING') {
            this.addLog('Dịch vụ đã chạy rồi.');
            return;
        }
        this.addLog(`<span class="text-green-400">Dịch vụ đã bắt đầu.</span>`);
        this.status = 'RUNNING';
        this.emitStatus();
        this.runLoop();
    }
    
    stop() {
        this.status = 'STOPPED';
        if (this.loopTimeout) clearTimeout(this.loopTimeout);
        this.loopTimeout = null;
        this.addLog('<span class="text-yellow-400">Dịch vụ đã dừng.</span>');
        this.emitStatus();
    }

    async runLoop() {
        while (this.status === 'RUNNING') {
            try {
                const accountsProcessed = await this.executeCheck();
                
                if (accountsProcessed === 0) {
                    await new Promise(resolve => this.loopTimeout = setTimeout(resolve, PAUSE_WHEN_NO_ACCOUNTS));
                } else {
                    await new Promise(resolve => this.loopTimeout = setTimeout(resolve, PAUSE_BETWEEN_BATCHES));
                }
            } catch (error) {
                this.addLog(`<span class="text-red-400">Lỗi trong vòng lặp chính: ${error.message}</span>`);
                await new Promise(resolve => this.loopTimeout = setTimeout(resolve, 60000));
            }
        }
    }

    async executeCheck() {
        await this.clearLogs();
        this.addLog('Bắt đầu chu kỳ kiểm tra mới...');
        this.lastRun = new Date();
        this.emitStatus();

        try {
            const { batchSize = 50, intervalMinutes = 10 } = this.config;
            const accountsToQueue = [];

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
                this.addLog(`Đã "đánh thức" ${idsToWake.length} tài khoản đang nghỉ.`);
            }

            const uncheckedAccounts = await Account.find({ status: 'UNCHECKED', isDeleted: false })
                .sort({ createdAt: 1 })
                .limit(batchSize)
                .select('_id')
                .lean();
            
            accountsToQueue.push(...uncheckedAccounts.map(a => a._id));

            if (accountsToQueue.length < batchSize) {
                const remainingLimit = batchSize - accountsToQueue.length;
                const priorityTimeLimit = new Date(Date.now() - intervalMinutes * 60 * 1000);
                
                const otherAccounts = await Account.find({
                    status: { $in: ['LIVE', 'DIE', 'ERROR'] },
                    isDeleted: false,
                    lastCheckedAt: { $lte: priorityTimeLimit }
                })
                .sort({ lastCheckedAt: 1 })
                .limit(remainingLimit)
                .select('_id')
                .lean();

                accountsToQueue.push(...otherAccounts.map(a => a._id));
            }

            if (accountsToQueue.length > 0) {
                this.addLog(`Đã xếp hàng <strong class="text-white">${accountsToQueue.length}</strong> tài khoản để kiểm tra.`);
                runCheckLive(accountsToQueue, this.io, {
                    concurrency: this.config.concurrency,
                    delay: this.config.delay,
                    timeout: this.config.timeout
                });
                return accountsToQueue.length;
            } else {
                this.addLog('Không có tài khoản nào cần kiểm tra trong chu kỳ này.');
                return 0;
            }
        } catch (error) {
            this.addLog(`<span class="text-red-400">Lỗi khi thực thi: ${error.message}</span>`);
            return 0;
        }
    }

    getStatus() {
        return {
            status: this.status,
            config: this.config,
            lastRun: this.lastRun,
            nextRun: null,
            logs: this.getLogs()
        };
    }

    emitStatus() {
        if (this.io) {
            this.io.emit('autoCheck:statusUpdate', this.getStatus());
        }
    }
}

module.exports = new AutoCheckManager();