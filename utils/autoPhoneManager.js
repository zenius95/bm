// utils/autoPhoneManager.js
const EventEmitter = require('events');
const fetch = require('node-fetch');
const settingsService = require('./settingsService');
const PhoneNumber = require('../models/PhoneNumber');

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
        if (this.logs.length > 100) this.logs.pop();
        if (this.io) this.io.emit('autoPhone:log', logEntry);
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
        const intervalMs = this.config.intervalMinutes * 60 * 1000;
        this.status = 'RUNNING';
        this.addLog(`<span class="text-green-400">Dịch vụ đã bắt đầu. Lấy số mỗi ${this.config.intervalMinutes} phút.</span>`);
        const runJob = async () => {
            if (this.isJobRunning) return;
            this.isJobRunning = true;
            this.emitStatus();
            await this.executeFetch();
            this.isJobRunning = false;
            this.nextRun = new Date(Date.now() + intervalMs);
            this.emitStatus();
        };
        runJob();
        this.timer = setInterval(runJob, intervalMs);
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
        const { countries, sources } = this.config;
        if (!countries || countries.length === 0) {
            this.addLog('<span class="text-yellow-400">Bỏ qua: Chưa có quốc gia nào được cấu hình.</span>');
            return;
        }

        for (const country of countries) {
            try {
                const response = await fetch(`https://otp-api.shelex.dev/api/list/${country}`);
                if (!response.ok) throw new Error(`API error for ${country}: ${response.statusText}`);
                const data = await response.json();

                const phonesToInsert = data
                    .filter(phone => sources.length === 0 || sources.includes(phone.source))
                    .map(phone => ({
                        phoneNumber: phone.phone,
                        country: country,
                        source: phone.source,
                    }));

                if (phonesToInsert.length > 0) {
                    const result = await PhoneNumber.insertMany(phonesToInsert, { ordered: false }).catch(err => err);
                    const insertedCount = result.insertedCount || (result.result && result.result.nInserted) || 0;
                    this.addLog(`Đã lấy và lưu <strong class="text-white">${insertedCount}</strong> số mới cho <strong class="text-white">${country}</strong>. Bỏ qua các số trùng lặp.`);
                } else {
                    this.addLog(`Không tìm thấy số mới nào cho <strong class="text-white">${country}</strong> với nguồn đã chọn.`);
                }
            } catch (error) {
                this.addLog(`<span class="text-red-400">Lỗi khi lấy số cho ${country}: ${error.message}</span>`);
            }
        }
        this.addLog('Hoàn thành chu kỳ lấy số.');
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