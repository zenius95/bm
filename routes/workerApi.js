// routes/workerApi.js
const express = require('express');
const router = express.Router();
const os = require('os-utils');
const itemProcessorManager = require('../utils/itemProcessorManager');
const Order = require('../models/Order');
const Account = require('../models/Account');
const Log = require('../models/Log');

// API để worker báo cáo trạng thái
router.get('/status', async (req, res) => {
    try {
        const cpuPromise = new Promise(resolve => os.cpuUsage(resolve));
        const pendingOrders = Order.countDocuments({ status: 'pending', isDeleted: false });
        const processingItems = Order.aggregate([
            { $match: { status: 'processing', isDeleted: false } },
            { $project: { processingItems: { $size: { $filter: { input: '$items', as: 'item', cond: { $eq: ['$$item.status', 'processing'] } } } } } },
            { $group: { _id: null, total: { $sum: '$processingItems' } } }
        ]);
        const liveAccounts = Account.countDocuments({ status: 'LIVE', isDeleted: false });
        const totalAccounts = Account.countDocuments({ isDeleted: false });

        const [ cpuPercent, pendingOrderCount, processingItemsResult, liveAccountCount, totalAccountCount ] = await Promise.all([
            cpuPromise, pendingOrders, processingItems, liveAccounts, totalAccounts
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
            data: { itemProcessor: itemProcessorStats, system: systemStats, global: globalStats }
        });
    } catch (error) {
        console.error("Error fetching system status:", error);
        res.status(500).json({ success: false, message: 'Failed to fetch system status.' });
    }
});

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

// API để lấy logs
router.get('/logs', async (req, res) => {
    try {
        const logs = await Log.find().sort({ timestamp: -1 }).limit(50).lean();
        res.json({ success: true, logs });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

module.exports = router;