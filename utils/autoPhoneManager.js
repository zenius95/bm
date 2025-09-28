// utils/autoPhoneManager.js
const EventEmitter = require('events');
const settingsService = require('./settingsService');
const PhoneNumber = require('../models/PhoneNumber');
// *** SỬA LẠI DÒNG NÀY ***
const { scrapeAllPhoneData } = require('./phoneScraper'); 
const fs = require('fs').promises;
const path = require('path');

const LOG_FILE = path.join(__dirname, '..', 'logs', 'autophone-log.txt');

class AutoPhoneManager extends EventEmitter {
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
        console.log('🔄 Initializing Auto Phone Fetcher Manager...');
        this.config = settingsService.get('autoPhone');
        if (this.config && this.config.isEnabled) {
            this.start();
        }
    }

    addLog(message) {
        const logEntry = { timestamp: new Date(), message };
        this.logs.unshift(logEntry);
        if (this.logs.length > 150) this.logs.pop();
        if (this.io) this.io.emit('autoPhone:log', logEntry);
        const fileLogMessage = `[${logEntry.timestamp.toLocaleString('vi-VN')}] ${message.replace(/<[^>]*>/g, '')}\n`;
        fs.appendFile(LOG_FILE, fileLogMessage).catch(err => console.error('Failed to write to autophone log file:', err));
    }

    getLogs() { return this.logs; }

    async updateConfig(newConfig) {
        const oldConfig = { ...this.config };
        this.config = { ...this.config, ...newConfig };
        await settingsService.update('autoPhone', this.config);
        this.addLog('Cấu hình đã được cập nhật.');

        const wasEnabled = oldConfig.isEnabled;
        const isNowEnabled = this.config.isEnabled;
        if (wasEnabled && !isNowEnabled) this.stop();
        else if (!wasEnabled && isNowEnabled) this.start();
        else if (isNowEnabled) this.restart();
    }

    start() {
        if (this.timer) clearInterval(this.timer);
        const intervalMs = (this.config.intervalMinutes || 60) * 60 * 1000;
        this.status = 'RUNNING';
        this.addLog(`<span class="text-green-400">Dịch vụ đã bắt đầu. Lấy số mỗi ${this.config.intervalMinutes} phút.</span>`);
        
        const runJob = async () => {
            if (this.isJobRunning) return;
            this.isJobRunning = true;
            this.emitStatus();
            await this.executeFetch();
            this.isJobRunning = false;
            this.updateNextRunTime();
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

    async executeFetch() {
        this.addLog('Bắt đầu chu kỳ lấy số điện thoại...');
        const configuredCountries = (this.config.countries || []).map(c => c.toLowerCase().trim()).filter(Boolean);
        
        // *** SỬA LẠI LỜI GỌI HÀM ***
        const allPhones = await scrapeAllPhoneData(configuredCountries, this.addLog.bind(this));
        
        if (allPhones.length > 0) {
            let insertedCount = 0;
            try {
                const result = await PhoneNumber.insertMany(allPhones, { ordered: false });
                insertedCount = result.length;
            } catch (error) {
                if (error.code === 11000) {
                    insertedCount = error.result.nInserted || 0;
                } else {
                    // Ném lỗi lên trên để catch bên ngoài xử lý
                    throw error;
                }
            }
            this.addLog(`Tổng kết: Đã lưu <strong class="text-white">${insertedCount}</strong> số mới vào database. Bỏ qua các số trùng lặp.`);
        } else {
             this.addLog(`Tổng kết: Không tìm thấy số điện thoại mới nào để thêm.`);
        }

        this.addLog('Hoàn thành chu kỳ lấy số.');
    }

    updateNextRunTime() {
        if (this.status === 'RUNNING' && this.timer) {
            const intervalMs = (this.config.intervalMinutes || 60) * 60 * 1000;
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
            this.io.emit('autoPhone:statusUpdate', this.getStatus());
        }
    }
}

module.exports = new AutoPhoneManager();