// controllers/orderController.js
const mongoose = require('mongoose');
const Order = require('../models/Order');

// POST /api/orders - Tạo đơn hàng mới từ API
exports.createOrder = async (req, res) => {
    try {
        const { itemsData } = req.body;
        if (!itemsData || !Array.isArray(itemsData) || itemsData.length === 0) {
            return res.status(400).json({ message: 'itemsData must be a non-empty array' });
        }
        const items = itemsData.map(data => ({ data, status: 'queued' }));
        const order = new Order({ items });
        await order.save();
        // Không cần thêm vào queue nữa
        console.log(`[Server] Order created: ${order._id}`);
        res.status(201).json({ message: 'Order created and queued for processing.', order });
    } catch (error) {
        console.error('[Server] Error creating order:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// GET /api/orders/:id - Lấy trạng thái đơn hàng từ API
exports.getOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid Order ID format' });
        }
        const order = await Order.findById(id);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }
        res.status(200).json(order);
    } catch (error) {
        console.error(`[Server] Error fetching order ${req.params.id}:`, error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};