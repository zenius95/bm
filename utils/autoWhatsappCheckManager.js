// utils/autoWhatsappCheckManager.js
const EventEmitter = require('events');
const Whatsapp = require('../models/Whatsapp');
const settingsService = require('../utils/settingsService');
const { runCheckWhatsapp } = require('./checkWhatsappService');
const fs = require('fs').promises;
const path = require('path');

const LOG_FILE = path.join(__dirname, '..', 'logs', 'autowhatsappcheck-log.txt');

class AutoWhatsappCheckManager extends EventEmitter {
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
            console.error('Lỗi khi đọc file autowhatsappcheck log:', error);
            return [];
        }
    }

    async initialize(io) {
        this.io = io;
        console.log('🔄 Initializing Auto WhatsApp Check Manager...');
        this.config = settingsService.get('autoWhatsappCheck');
        await fs.mkdir(path.dirname(LOG_FILE), { recursive: true });
        this.logs = await this.readLogFile();
        if (this.config && this.config.isEnabled) {
            this.start();
        } else {
            this.emitStatus();
        }
    }

    addLog(message) {
        const logEntry = { timestamp: new Date(), message };
        this.logs.unshift(logEntry);
        if (this.io) this.io.emit('autoWhatsappCheck:log', logEntry);
        const fileLogMessage = `[${logEntry.timestamp.toLocaleString('vi-VN')}] ${message.replace(/<[^>]*>/g, '')}\n`;
        fs.appendFile(LOG_FILE, fileLogMessage).catch(err => console.error('Failed to write to log file:', err));
    }

    async clearLogs() {
        this.logs = [];
        try {
            await fs.writeFile(LOG_FILE, '');
        } catch (err) {
            console.error('Failed to clear log file:', err);
        }
    }
    
    getLogs() { return this.logs; }

    async updateConfig(newConfig) {
        const oldConfig = { ...this.config };
        this.config = { ...this.config, ...newConfig };
        
        await settingsService.update('autoWhatsappCheck', this.config);
        
        const wasEnabled = oldConfig.isEnabled;
        const isNowEnabled = this.config.isEnabled;
        
        this.addLog('Cấu hình đã được cập nhật.');

        if (wasEnabled && !isNowEnabled) this.stop();
        else if (!wasEnabled && isNowEnabled) this.start();
        else if (wasEnabled && isNowEnabled) this.restart();
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
                this.addLog(`<span class="text-red-400">Lỗi: ${e.message}</span>`);
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
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        this.status = 'STOPPED';
        this.nextRun = null;
        this.addLog('<span class="text-yellow-400">Dịch vụ đã dừng.</span>');
        this.emitStatus();
    }

    restart() { this.stop(); setTimeout(() => this.start(), 200); }
    
    async executeCheck() {
        await this.clearLogs();
        this.addLog('Bắt đầu chu kỳ kiểm tra...');
        const batchSize = parseInt(this.config.batchSize, 10) || 0;
        
        const query = {
            isDeleted: false,
            status: { $in: ['CONNECTED', 'DISCONNECTED'] }
        };

        const sessionsToCheck = await Whatsapp.find(query)
            .sort({ lastCheckedAt: 1 }) // Ưu tiên check những cái cũ nhất
            .limit(batchSize > 0 ? batchSize : 0)
            .select('_id')
            .lean();

        if (sessionsToCheck.length > 0) {
            this.addLog(`Đã xếp hàng <strong class="text-white">${sessionsToCheck.length}</strong> phiên để kiểm tra.`);
            const sessionIds = sessionsToCheck.map(s => s._id.toString());
            await runCheckWhatsapp(sessionIds, this.io);
        } else {
            this.addLog('Không có phiên nào cần kiểm tra trong chu kỳ này.');
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
            this.io.emit('autoWhatsappCheck:statusUpdate', this.getStatus());
        }
    }
}

module.exports = new AutoWhatsappCheckManager();