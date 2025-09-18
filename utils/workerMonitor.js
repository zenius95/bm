// utils/workerMonitor.js
const Worker = require('../models/Worker');
const fetch = require('node-fetch'); // <<< THÊM DÒNG NÀY

class WorkerMonitor {
    constructor() {
        this.io = null;
        this.timer = null;
        this.workers = [];
        this.status = 'STOPPED';
    }

    initialize(io) {
        this.io = io;
        console.log('🔄 Initializing Worker Monitor...');
        this.start();
    }

    async start() {
        if (this.timer) return;
        this.status = 'RUNNING';
        console.log('[WorkerMonitor] Service started. Checking workers every 15 seconds.');
        await this.loadAndCheckWorkers();
        this.timer = setInterval(() => this.loadAndCheckWorkers(), 15000); // Check every 15 seconds
        this.emitStatus();
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.status = 'STOPPED';
        console.log('[WorkerMonitor] Service stopped.');
        this.emitStatus();
    }
    
    emitStatus() {
        if (this.io) {
            this.io.emit('workerMonitor:statusUpdate', {
                status: this.status,
                workers: this.workers
            });
        }
    }

    async loadAndCheckWorkers() {
        try {
            const workersFromDB = await Worker.find({ isDeleted: false }).lean();
            const checkPromises = workersFromDB.map(worker => this.checkWorkerStatus(worker));
            this.workers = await Promise.all(checkPromises);
            this.emitStatus();
        } catch (error) {
            console.error('[WorkerMonitor] Error loading workers:', error);
        }
    }

    async checkWorkerStatus(worker) {
        try {
            const response = await fetch(`${worker.address}/worker-api/ping`, {
                method: 'GET',
                headers: { 'X-API-KEY': worker.apiKey },
                timeout: 5000 // 5 seconds timeout
            });
            
            if (!response.ok) {
                 throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return { ...worker, status: 'online', cpuUsage: data.cpuUsage, memoryUsage: data.memoryUsage };
            
        } catch (error) {
            // console.warn(`Failed to connect to worker ${worker.name} (${worker.address}): ${error.message}`);
            return { ...worker, status: 'offline', cpuUsage: -1, memoryUsage: -1 };
        }
    }
}

module.exports = new WorkerMonitor();