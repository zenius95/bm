// utils/autoProxyCheckManager.js
const settingsService = require('./settingsService');
const Proxy = require('../models/Proxy');
const { runCheckProxy } = require('./checkProxyService');
const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');

const LOG_FILE = path.join(__dirname, '..', 'logs', 'autoproxycheck-log.txt');

class AutoProxyCheckManager extends EventEmitter {
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
            console.error('Lỗi khi đọc file autoproxycheck log:', error);
            return [];
        }
    }

    async initialize(io) {
        this.io = io;
        console.log('🔄 Initializing Auto Proxy Check Manager...');
        this.config = settingsService.get('autoProxyCheck');
        await fs.mkdir(path.dirname(LOG_FILE), { recursive: true });
        this.logs = await this.readLogFile();
        if (this.config.isEnabled) {
            this.start();
        } else {
            this.emitStatus();
        }
    }

    addLog(message) {
        const logEntry = { timestamp: new Date(), message };
        this.logs.unshift(logEntry);
        if (this.io) this.io.emit('autoProxyCheck:log', logEntry);
        const fileLogMessage = `[${logEntry.timestamp.toLocaleString('vi-VN')}] ${message.replace(/<[^>]*>/g, '')}\n`;
        fs.appendFile(LOG_FILE, fileLogMessage).catch(err => console.error('Failed to write to autoproxycheck log file:', err));
    }
    
    async clearLogs() {
        this.logs = [];
        try {
            await fs.writeFile(LOG_FILE, '');
        } catch (err) {
            console.error('Failed to clear autoproxycheck log file:', err);
        }
    }

    getLogs() {
        return this.logs;
    }

    async updateConfig(newConfig) {
        const oldConfig = { ...this.config };
        this.config = { ...this.config, ...newConfig };
        
        await settingsService.update('autoProxyCheck', this.config);
        
        const wasEnabled = oldConfig.isEnabled;
        const isNowEnabled = this.config.isEnabled;
        const settingsChanged = JSON.stringify(oldConfig) !== JSON.stringify(this.config);
        
        this.addLog('Cấu hình đã được cập nhật.');

        if (wasEnabled && !isNowEnabled) this.stop();
        else if (!wasEnabled && isNowEnabled) this.start();
        else if (wasEnabled && isNowEnabled && settingsChanged) this.restart();
        else this.emitStatus();
    }

    start() {
        if (this.timer) clearInterval(this.timer);
        const intervalMs = this.config.intervalMinutes * 60 * 1000;
        this.status = 'RUNNING';
        this.addLog(`<span class="text-green-400">Dịch vụ đã bắt đầu. Kiểm tra mỗi ${this.config.intervalMinutes} phút.</span>`);
        
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
                this.addLog(`<span class="text-red-400">Lỗi trong quá trình kiểm tra định kỳ: ${e.message}</span>`);
                console.error('[AutoProxyCheck] Lỗi trong quá trình kiểm tra định kỳ:', e);
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
        this.stop();
        setTimeout(() => this.start(), 200);
    }
    
    async executeCheck() {
        await this.clearLogs();
        this.addLog('Bắt đầu chu kỳ kiểm tra proxy...');
        const batchSize = parseInt(this.config.batchSize, 10) || 0;
        let proxiesToCheck = [];

        const uncheckedProxies = await Proxy.find({ status: 'UNCHECKED' })
            .sort({ createdAt: 1 })
            .limit(batchSize)
            .lean();

        proxiesToCheck = [...uncheckedProxies];

        const remainingLimit = batchSize > 0 ? batchSize - proxiesToCheck.length : 0;
        
        if (batchSize === 0 || remainingLimit > 0) {
            const otherProxies = await Proxy.find({ status: { $in: ['AVAILABLE'] } }) // Bỏ qua ASSIGNED
                .sort({ lastCheckedAt: 1, createdAt: 1 }) 
                .limit(batchSize === 0 ? 0 : remainingLimit)
                .lean();
            proxiesToCheck.push(...otherProxies);
        }

        if (proxiesToCheck.length > 0) {
            this.addLog(`Đã xếp hàng <strong class="text-white">${proxiesToCheck.length}</strong> proxy để kiểm tra.`);
            const proxyIds = proxiesToCheck.map(p => p._id.toString());
            await runCheckProxy(proxyIds, this.io, {
                concurrency: this.config.concurrency,
                delay: this.config.delay,
                timeout: this.config.timeout
            });
        } else {
            this.addLog('Không có proxy nào cần kiểm tra trong chu kỳ này.');
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
            logs: this.getLogs()
        };
    }

    emitStatus() { 
        if (this.io) {
            this.io.emit('autoProxyCheck:statusUpdate', this.getStatus());
        }
    }
}

module.exports = new AutoProxyCheckManager();