// controllers/workerController.js
const Worker = require('../models/Worker');
const itemProcessorManager = require('../utils/itemProcessorManager');
const Log = require('../models/Log');

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

        res.render('workers', {
            workers,
            page: 'workers',
            initialState: {
                itemProcessor: itemProcessorManager.getStatus()
            }
        });
    } catch (error) {
        console.error("Error loading workers page:", error);
        res.status(500).send("Could not load workers page.");
    }
};

workerController.addWorker = async (req, res) => {
    try {
        const { name, url, username, password, concurrency } = req.body;
        if (!name || !url || !username || !password) {
            return res.status(400).json({ success: false, message: 'Vui lòng điền đầy đủ thông tin.' });
        }

        const existingWorker = await Worker.findOne({ url });
        if (existingWorker) {
            return res.status(400).json({ success: false, message: 'URL của worker đã tồn tại.' });
        }

        const newWorker = new Worker({ name, url, username, password, concurrency: concurrency || 10 });
        await newWorker.save();

        res.json({ success: true, message: 'Thêm worker thành công!', worker: newWorker });

    } catch (error) {
        console.error("Error adding worker:", error);
        res.status(500).json({ success: false, message: 'Lỗi server khi thêm worker.' });
    }
};

workerController.updateWorker = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, url, username, password, concurrency } = req.body;
        
        const workerToUpdate = await Worker.findById(id);
        if (!workerToUpdate) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy worker.' });
        }

        if (workerToUpdate.isLocal) {
            workerToUpdate.name = name;
            workerToUpdate.concurrency = concurrency;
        } else {
            if (!name || !url || !username) {
                return res.status(400).json({ success: false, message: 'Tên, URL và Username là bắt buộc.' });
            }
            workerToUpdate.name = name;
            workerToUpdate.url = url;
            workerToUpdate.username = username;
            workerToUpdate.concurrency = concurrency;
            if (password) {
                workerToUpdate.password = password;
            }
        }
        
        await workerToUpdate.save();

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
        res.json({ success: true, message: 'Đã xóa worker.' });
    } catch (error) {
        console.error("Error deleting worker:", error);
        res.status(500).json({ success: false, message: 'Lỗi server khi xóa worker.' });
    }
};

workerController.getWorkerLogs = async (req, res) => {
    try {
        const logs = await Log.find().sort({ timestamp: -1 }).limit(50).lean();
        res.json({ success: true, logs });
    } catch (error) {
        console.error("Error fetching worker logs:", error);
        res.status(500).json({ success: false, message: 'Lỗi server khi lấy logs.' });
    }
};

// === START: THAY ĐỔI QUAN TRỌNG ===
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
        res.json({ success: true, message: `Đã ${statusText} worker.` });
    } catch (error) {
        console.error("Error toggling worker:", error);
        res.status(500).json({ success: false, message: 'Lỗi server.' });
    }
};
// === END: THAY ĐỔI QUAN TRỌNG ===

module.exports = workerController;