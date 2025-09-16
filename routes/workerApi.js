// routes/workerApi.js
const express = require('express');
const router = express.Router();
const os = require('os-utils');
const itemProcessorManager = require('../utils/itemProcessorManager');
const Order = require('../models/Order');
const Account = require('../models/Account');
const Log = require('../models/Log');
const Item = require('../models/Item'); // Thêm Item model

// API để worker báo cáo trạng thái
router.get('/status', async (req, res) => {
    try {
        const cpuPromise = new Promise(resolve => os.cpuUsage(resolve));
        
        // === START: THAY ĐỔI QUAN TRỌNG ===
        // Các thống kê này giờ sẽ được tính toán một cách hiệu quả hơn
        // hoặc không còn cần thiết trên từng worker vì logic đã tập trung
        const queuedItems = Item.countDocuments({ status: 'queued' });
        const processingItems = Account.countDocuments({ status: 'IN_USE' }); // Số item đang xử lý = số account đang dùng
        // === END: THAY ĐỔI QUAN TRỌNG ===

        const liveAccounts = Account.countDocuments({ status: 'LIVE', isDeleted: false });
        const totalAccounts = Account.countDocuments({ isDeleted: false });

        const [ 
            cpuPercent, 
            queuedItemCount, 
            processingItemCount, 
            liveAccountCount, 
            totalAccountCount 
        ] = await Promise.all([
            cpuPromise, queuedItems, processingItems, liveAccounts, totalAccounts
        ]);
        
        const itemProcessorStats = itemProcessorManager.getStatus();
        const systemStats = {
            cpu: (cpuPercent * 100).toFixed(2),
            freeMem: os.freemem().toFixed(0),
            totalMem: os.totalmem().toFixed(0)
        };

        // Dữ liệu global stats giờ được đơn giản hóa
        const globalStats = {
            pendingOrders: queuedItemCount, // Coi item đang chờ là đơn chờ xử lý
            processingItems: processingItemCount,
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

// === START: THAY ĐỔI QUAN TRỌNG ===
// Endpoint /process-item không còn cần thiết và đã được xóa bỏ
// router.post('/process-item', async (req, res) => { ... });
// === END: THAY ĐỔI QUAN TRỌNG ===

// API để lấy logs vẫn giữ nguyên
router.get('/logs', async (req, res) => {
    try {
        // Lấy log liên quan đến xử lý item thay vì log chung
        const logs = await Log.find().sort({ timestamp: -1 }).limit(50).lean();
        res.json({ success: true, logs });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

module.exports = router;