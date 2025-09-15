// routes/order.js
const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const Log = require('../models/Log');
const os = require('os-utils');
const itemProcessorManager = require('../utils/itemProcessorManager');

// API tạo và lấy thông tin order công khai
router.post('/orders', orderController.createOrder);
router.get('/orders/:id', orderController.getOrderStatus);
router.get('/orders/:id/logs', async (req, res) => {
    try {
        const { id } = req.params;
        const logs = await Log.find({ orderId: id }).sort({ timestamp: 'asc' });
        res.status(200).json(logs);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// API để worker báo cáo trạng thái
router.get('/status', (req, res) => {
    os.cpuUsage((cpuPercent) => {
        const itemProcessorStats = itemProcessorManager.getStatus();
        const systemStats = {
            cpu: (cpuPercent * 100).toFixed(2),
            freeMem: os.freemem().toFixed(0),
            totalMem: os.totalmem().toFixed(0)
        };
        res.json({
            success: true,
            data: {
                itemProcessor: itemProcessorStats,
                system: systemStats
            }
        });
    });
});

// API để worker tiếp nhận và xử lý một item
router.post('/process-item', async (req, res) => {
    try {
        const { orderId, itemId, itemData } = req.body;
        if (!orderId || !itemId || !itemData) {
            return res.status(400).json({ success: false, message: 'Thiếu thông tin item.' });
        }

        // Báo cho Tổng hành dinh biết là đã nhận lệnh
        res.status(202).json({ success: true, message: 'Đã nhận item, bắt đầu xử lý.' });

        // Chạy xử lý trong nền
        itemProcessorManager.processSingleItem(orderId, itemId, itemData);

    } catch (error) {
        console.error('[API /process-item] Error:', error);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: 'Lỗi server khi tiếp nhận item.' });
        }
    }
});

module.exports = router;