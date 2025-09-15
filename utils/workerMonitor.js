// utils/workerMonitor.js
const Worker = require('../models/Worker');
const fetch = require('node-fetch');

const MONITORING_INTERVAL = 10000; // 10 giây

class WorkerMonitor {
    constructor() {
        this.io = null;
        this.timer = null;
    }

    initialize(io) {
        this.io = io;
        console.log('🔄 Initializing Worker Monitor...');
        if (this.timer) clearInterval(this.timer);
        this.timer = setInterval(() => this.checkAllWorkers(), MONITORING_INTERVAL);
        this.checkAllWorkers();
    }

    async checkAllWorkers() {
        // Lấy lại danh sách worker mới nhất mỗi lần check
        const workers = await Worker.find().lean();
        const workerPromises = workers.map(worker => this.checkWorkerByAPI(worker));
        
        const updatedWorkers = await Promise.all(workerPromises);
        
        if (this.io) {
            this.io.emit('workers:update', updatedWorkers);
        }
    }

    async checkWorkerByAPI(worker) {
        const { url, apiKey } = worker; // Dùng apiKey thay vì username/password
        let updateData;

        // Bỏ qua nếu worker không có apiKey (có thể là worker mới chưa kịp tạo)
        if (!apiKey) {
            return { ...worker, status: 'error', stats: { error: 'Missing API Key' } };
        }

        try {
            // === START: THAY ĐỔI URL VÀ HEADER ===
            const response = await fetch(`${url}/worker-api/status`, {
                headers: { 'X-API-Key': apiKey },
                timeout: 5000
            });
            // === END: THAY ĐỔI URL VÀ HEADER ===

            if (!response.ok) throw new Error(`Status: ${response.status}`);

            const { data } = await response.json();
            
            updateData = {
                status: 'online',
                'stats.cpu': data.system.cpu,
                'stats.freeMem': data.system.freeMem,
                'stats.totalMem': data.system.totalMem,
                'stats.activeTasks': data.itemProcessor.activeTasks,
                'stats.queuedTasks': data.itemProcessor.queuedTasks,
                'stats.pendingOrders': data.global.pendingOrders,
                'stats.processingItems': data.global.processingItems,
                'stats.liveAccounts': data.global.liveAccounts,
                'stats.totalAccounts': data.global.totalAccounts,
                lastSeen: new Date()
            };
        } catch (error) {
            console.error(`Failed to connect to worker ${worker.name} (${url}): ${error.message}`);
            updateData = { status: 'offline', 'stats': {} }; 
        }
        
        const updated = await Worker.findByIdAndUpdate(worker._id, updateData, { new: true }).lean();
        return updated;
    }
}

module.exports = new WorkerMonitor();