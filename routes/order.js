// routes/order.js
const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const Log = require('../models/Log');
const os = require('os-utils');
const itemProcessorManager = require('../utils/itemProcessorManager');
// === START: THAY ĐỔI QUAN TRỌNG ===
const Order = require('../models/Order');
const Account = require('../models/Account');
// === END: THAY ĐỔI QUAN TRỌNG ===


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
// === START: THAY ĐỔI QUAN TRỌNG - Bổ sung stats chi tiết ===
router.get('/status', async (req, res) => {
    try {
        const cpuPromise = new Promise(resolve => os.cpuUsage(resolve));

        // Lấy các thống kê global từ DB
        const pendingOrders = Order.countDocuments({ status: 'pending', isDeleted: false });
        const processingItems = Order.aggregate([
            { $match: { status: 'processing', isDeleted: false } },
            { $project: { processingItems: { $size: { $filter: { input: '$items', as: 'item', cond: { $eq: ['$$item.status', 'processing'] } } } } } },
            { $group: { _id: null, total: { $sum: '$processingItems' } } }
        ]);
        const liveAccounts = Account.countDocuments({ status: 'LIVE', isDeleted: false });
        const totalAccounts = Account.countDocuments({ isDeleted: false });

        // Chạy song song các tác vụ bất đồng bộ
        const [
            cpuPercent,
            pendingOrderCount,
            processingItemsResult,
            liveAccountCount,
            totalAccountCount
        ] = await Promise.all([
            cpuPromise,
            pendingOrders,
            processingItems,
            liveAccounts,
            totalAccounts
        ]);
        
        const itemProcessorStats = itemProcessorManager.getStatus();
        const systemStats = {
            cpu: (cpuPercent * 100).toFixed(2),
            freeMem: os.freemem().toFixed(0),
            totalMem: os.totalmem().toFixed(0)
        };
        const globalStats = {
            pendingOrders: pendingOrderCount,
            processingItems: processingItemsResult.length > 0 ? processingItemsResult[0].total : 0,
            liveAccounts: liveAccountCount,
            totalAccounts: totalAccountCount
        };

        res.json({
            success: true,
            data: {
                itemProcessor: itemProcessorStats,
                system: systemStats,
                global: globalStats
            }
        });
    } catch (error) {
        console.error("Error fetching system status:", error);
        res.status(500).json({ success: false, message: 'Failed to fetch system status.' });
    }
});
// === END: THAY ĐỔI QUAN TRỌNG ===


// API để worker tiếp nhận và xử lý một item
router.post('/process-item', async (req, res) => {
    try {
        const { orderId, itemId, itemData } = req.body;
        if (!orderId || !itemId || !itemData) {
            return res.status(400).json({ success: false, message: 'Thiếu thông tin item.' });
        }

        res.status(202).json({ success: true, message: 'Đã nhận item, bắt đầu xử lý.' });
        itemProcessorManager.processSingleItem(orderId, itemId, itemData);

    } catch (error) {
        console.error('[API /process-item] Error:', error);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: 'Lỗi server khi tiếp nhận item.' });
        }
    }
});

module.exports = router;