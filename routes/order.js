// routes/order.js
const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const Log = require('../models/Log');

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

module.exports = router;