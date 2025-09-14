// controllers/orderController.js
const mongoose = require('mongoose');
const Order = require('../models/Order');
const { orderQueue } = require('../queue');

// POST /api/orders - Tạo đơn hàng mới
exports.createOrder = async (req, res) => {
    try {
        const { itemsData } = req.body;
        if (!itemsData || !Array.isArray(itemsData) || itemsData.length === 0) {
            return res.status(400).json({ message: 'itemsData must be a non-empty array' });
        }
        const items = itemsData.map(data => ({ data, status: 'queued' }));
        const order = new Order({ items });
        await order.save();
        await orderQueue.add('process-order', { orderId: order._id });
        console.log(`[Server] Job added to queue for Order ID: ${order._id}`);
        res.status(202).json({ message: 'Order accepted and is being processed.', order });
    } catch (error) {
        console.error('[Server] Error creating order:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// GET /api/orders/:id - Lấy trạng thái đơn hàng
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