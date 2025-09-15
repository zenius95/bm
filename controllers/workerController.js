// controllers/workerController.js
const Worker = require('../models/Worker');
const itemProcessorManager = require('../utils/itemProcessorManager');

const workerController = {};

workerController.getWorkersPage = async (req, res) => {
    try {
        const workers = await Worker.find().sort({ isLocal: -1, createdAt: 1 }).lean();
        
        // Cập nhật trạng thái cho worker cục bộ
        const localWorker = workers.find(w => w.isLocal);
        if (localWorker) {
            const localStats = itemProcessorManager.getStatus();
            localWorker.status = 'online'; // Luôn online nếu server đang chạy
            localWorker.stats = {
                activeTasks: localStats.activeTasks,
                queuedTasks: localStats.queuedTasks,
            };
        }

        res.render('workers', {
            workers,
            page: 'workers'
        });
    } catch (error) {
        console.error("Error loading workers page:", error);
        res.status(500).send("Could not load workers page.");
    }
};

workerController.addWorker = async (req, res) => {
    try {
        const { name, url, username, password } = req.body;
        if (!name || !url || !username || !password) {
            return res.status(400).json({ success: false, message: 'Vui lòng điền đầy đủ thông tin.' });
        }

        const existingWorker = await Worker.findOne({ url });
        if (existingWorker) {
            return res.status(400).json({ success: false, message: 'URL của worker đã tồn tại.' });
        }

        const newWorker = new Worker({ name, url, username, password });
        await newWorker.save();

        res.json({ success: true, message: 'Thêm worker thành công!', worker: newWorker });

    } catch (error) {
        console.error("Error adding worker:", error);
        res.status(500).json({ success: false, message: 'Lỗi server khi thêm worker.' });
    }
};

module.exports = workerController;