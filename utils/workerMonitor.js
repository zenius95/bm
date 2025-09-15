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
        const workers = await Worker.find().lean();

        // === START: THAY ĐỔI QUAN TRỌNG ===
        // Luôn kiểm tra tất cả worker qua API
        const workerPromises = workers.map(worker => this.checkWorkerByAPI(worker));
        // === END: THAY ĐỔI QUAN TRỌNG ===
        
        const updatedWorkers = await Promise.all(workerPromises);
        
        if (this.io) {
            this.io.emit('workers:update', updatedWorkers);
        }
    }

    // === START: THAY ĐỔI QUAN TRỌNG - Đổi tên hàm và xóa hàm cũ ===
    async checkWorkerByAPI(worker) {
    // === END: THAY ĐỔI QUAN TRỌNG ===
        const { url, username, password } = worker;
        const auth = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
        let updateData;

        try {
            const response = await fetch(`${url}/api/status`, {
                headers: { 'Authorization': auth },
                timeout: 5000
            });

            if (!response.ok) throw new Error(`Status: ${response.status}`);

            const { data } = await response.json();
            updateData = {
                status: 'online',
                'stats.cpu': data.system.cpu,
                'stats.freeMem': data.system.freeMem,
                'stats.totalMem': data.system.totalMem,
                'stats.activeTasks': data.itemProcessor.activeTasks,
                'stats.queuedTasks': data.itemProcessor.queuedTasks,
                lastSeen: new Date()
            };
        } catch (error) {
            console.error(`Failed to connect to worker ${worker.name} (${url}): ${error.message}`);
            updateData = { status: 'offline', 'stats': {} }; // Reset stats khi offline
        }
        
        const updated = await Worker.findByIdAndUpdate(worker._id, updateData, { new: true }).lean();
        return updated;
    }
}

module.exports = new WorkerMonitor();