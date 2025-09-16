// controllers/workerController.js
const Worker = require('../models/Worker');
const itemProcessorManager = require('../utils/itemProcessorManager');
const Log = require('../models/Log');
const fetch = require('node-fetch');
const { logActivity } = require('../utils/activityLogService');

const workerController = {};

workerController.getWorkersPage = async (req, res) => {
    try {
        const workers = await Worker.find().sort({ isLocal: -1, createdAt: 1 }).lean();
        
        const localWorker = workers.find(w => w.isLocal);
        if (localWorker) {
            const localStats = itemProcessorManager.getStatus();
            localWorker.status = 'online';
            localWorker.stats = {
                activeTasks: localStats.activeTasks,
                queuedTasks: localStats.queuedTasks,
            };
        }

        res.render('admin/workers', {
            workers,
            page: 'workers',
            initialState: {
                itemProcessor: itemProcessorManager.getStatus()
            },
            title: 'Worker Management'
        });
    } catch (error) {
        console.error("Error loading workers page:", error);
        res.status(500).send("Could not load workers page.");
    }
};

workerController.addWorker = async (req, res) => {
    try {
        const { name, url, apiKey, concurrency } = req.body;
        if (!name || !url || !apiKey) {
            return res.status(400).json({ success: false, message: 'Vui lòng điền đầy đủ thông tin.' });
        }

        const existingWorker = await Worker.findOne({ url });
        if (existingWorker) {
            return res.status(400).json({ success: false, message: 'URL của worker đã tồn tại.' });
        }

        const newWorker = new Worker({ name, url, apiKey, concurrency: concurrency || 10 });
        await newWorker.save();

        await logActivity(req.session.user.id, 'ADMIN_ADD_WORKER', {
            details: `Admin '${req.session.user.username}' đã thêm worker mới: '${name}'.`,
            ipAddress: req.ip || req.connection.remoteAddress,
            context: 'Admin'
        });

        res.json({ success: true, message: 'Thêm worker thành công!', worker: newWorker });
    } catch (error) {
        console.error("Error adding worker:", error);
        res.status(500).json({ success: false, message: 'Lỗi server khi thêm worker.' });
    }
};

workerController.updateWorker = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, url, apiKey, concurrency } = req.body;
        
        const workerToUpdate = await Worker.findById(id);
        if (!workerToUpdate) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy worker.' });
        }

        workerToUpdate.name = name;
        workerToUpdate.concurrency = concurrency;
        if (!workerToUpdate.isLocal) {
            workerToUpdate.url = url;
            workerToUpdate.apiKey = apiKey;
        }
        
        await workerToUpdate.save();

        await logActivity(req.session.user.id, 'ADMIN_UPDATE_WORKER', {
            details: `Admin '${req.session.user.username}' đã cập nhật worker '${name}'.`,
            ipAddress: req.ip || req.connection.remoteAddress,
            context: 'Admin'
        });

        res.json({ success: true, message: 'Cập nhật worker thành công.' });
    } catch (error) {
        console.error("Error updating worker:", error);
        res.status(500).json({ success: false, message: 'Lỗi server khi cập nhật worker.' });
    }
};

workerController.deleteWorker = async (req, res) => {
    try {
        const { id } = req.params;
        const workerToDelete = await Worker.findById(id);

        if (!workerToDelete) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy worker.' });
        }
        if (workerToDelete.isLocal) {
            return res.status(400).json({ success: false, message: 'Không thể xóa worker mặc định.' });
        }

        await Worker.findByIdAndDelete(id);

        await logActivity(req.session.user.id, 'ADMIN_DELETE_WORKER', {
            details: `Admin '${req.session.user.username}' đã xóa worker '${workerToDelete.name}'.`,
            ipAddress: req.ip || req.connection.remoteAddress,
            context: 'Admin'
        });

        res.json({ success: true, message: 'Đã xóa worker.' });
    } catch (error) {
        console.error("Error deleting worker:", error);
        res.status(500).json({ success: false, message: 'Lỗi server khi xóa worker.' });
    }
};

workerController.toggleWorker = async (req, res) => {
    try {
        const { id } = req.params;
        const { isEnabled } = req.body;

        const worker = await Worker.findById(id);
        if (!worker) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy worker.' });
        }
        if (worker.isLocal) {
            return res.status(400).json({ success: false, message: 'Không thể tắt worker mặc định.' });
        }

        worker.isEnabled = isEnabled;
        await worker.save();
        
        const statusText = isEnabled ? 'bật' : 'tắt';
        
        await logActivity(req.session.user.id, 'ADMIN_TOGGLE_WORKER', {
            details: `Admin '${req.session.user.username}' đã ${statusText} worker '${worker.name}'.`,
            ipAddress: req.ip || req.connection.remoteAddress,
            context: 'Admin'
        });

        res.json({ success: true, message: `Đã ${statusText} worker.` });
    } catch (error) {
        console.error("Error toggling worker:", error);
        res.status(500).json({ success: false, message: 'Lỗi server.' });
    }
};

workerController.getWorkerLogs = async (req, res) => {
    try {
        const { id } = req.params;
        const worker = await Worker.findById(id).lean();

        if (!worker) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy worker.' });
        }

        if (worker.isLocal) {
            const logs = await Log.find().sort({ timestamp: -1 }).limit(50).lean();
            return res.json({ success: true, logs });
        }

        const { url, apiKey } = worker;
        const response = await fetch(`${url}/worker-api/logs`, {
            headers: { 'X-API-Key': apiKey },
            timeout: 5000
        });

        if (!response.ok) {
            throw new Error(`Worker tại ${url} trả về status ${response.status}`);
        }

        const result = await response.json();
        res.json(result);

    } catch (error) {
        console.error(`Lỗi khi lấy logs cho worker ${req.params.id}:`, error);
        res.status(500).json({ success: false, message: 'Lỗi server khi lấy logs: ' + error.message });
    }
};

module.exports = workerController;
