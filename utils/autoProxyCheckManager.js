// utils/autoProxyCheckManager.js
const settingsService = require('./settingsService');
const Proxy = require('../models/Proxy');
const { runCheckProxy } = require('./checkProxyService');
const EventEmitter = require('events');

class AutoProxyCheckManager extends EventEmitter {
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
        console.log('🔄 Initializing Auto Proxy Check Manager...');
        this.config = settingsService.get('autoProxyCheck');
        if (this.config.isEnabled) {
            this.start();
        } else {
            this.emitStatus();
        }
    }

    async updateConfig(newConfig) {
        const oldConfig = { ...this.config };
        this.config = { ...this.config, ...newConfig };
        
        await settingsService.update('autoProxyCheck', this.config);
        
        const wasEnabled = oldConfig.isEnabled;
        const isNowEnabled = this.config.isEnabled;
        const settingsChanged = JSON.stringify(oldConfig) !== JSON.stringify(this.config);

        if (wasEnabled && !isNowEnabled) this.stop();
        else if (!wasEnabled && isNowEnabled) this.start();
        else if (wasEnabled && isNowEnabled && settingsChanged) this.restart();
        else this.emitStatus();
    }

    start() {
        if (this.timer) clearInterval(this.timer);
        const intervalMs = this.config.intervalMinutes * 60 * 1000;
        this.status = 'RUNNING';
        
        const runJob = async () => {
            if (this.isJobRunning) {
                console.log('[AutoProxyCheck] Một phiên kiểm tra đang chạy, bỏ qua lần này.');
                return;
            }
            try {
                this.isJobRunning = true;
                this.emitStatus();
                await this.executeCheck();
            } catch(e) {
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
        this.emitStatus();
    }

    restart() {
        this.stop();
        setTimeout(() => this.start(), 200);
    }
    
    async executeCheck() {
        const batchSize = parseInt(this.config.batchSize, 10) || 0; // 0 nghĩa là không giới hạn
        let proxiesToCheck = [];

        // Ưu tiên lấy các proxy UNCHECKED trước
        const uncheckedProxies = await Proxy.find({ status: 'UNCHECKED' })
            .sort({ createdAt: 1 }) // Sắp xếp theo ngày tạo cũ nhất trước
            .limit(batchSize)
            .lean();

        proxiesToCheck = [...uncheckedProxies];

        // Nếu vẫn còn chỗ trong batch, lấy các proxy khác (không phải UNCHECKED hoặc CHECKING)
        const remainingLimit = batchSize > 0 ? batchSize - proxiesToCheck.length : 0;
        
        if (batchSize === 0 || remainingLimit > 0) {
            const otherProxies = await Proxy.find({ status: { $nin: ['UNCHECKED', 'CHECKING'] } })
                .sort({ lastCheckedAt: 1, createdAt: 1 }) // Ưu tiên check proxy cũ nhất hoặc chưa check bao giờ
                .limit(batchSize === 0 ? 0 : remainingLimit)
                .lean();
            proxiesToCheck.push(...otherProxies);
        }

        if (proxiesToCheck.length > 0) {
            const proxyIds = proxiesToCheck.map(p => p._id.toString());
            await runCheckProxy(proxyIds, this.io, {
                concurrency: this.config.concurrency,
                delay: this.config.delay,
                timeout: this.config.timeout
            });
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
            this.io.emit('autoProxyCheck:statusUpdate', this.getStatus());
        }
    }
}

module.exports = new AutoProxyCheckManager();