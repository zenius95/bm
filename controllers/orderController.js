// controllers/orderController.js
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Item = require('../models/Item'); // Thêm model Item

// POST /api/orders - Tạo đơn hàng mới từ API
exports.createOrder = async (req, res) => {
    try {
        const { itemsData, userId } = req.body; // Giả sử API có thể nhận userId
        if (!itemsData || !Array.isArray(itemsData) || itemsData.length === 0) {
            return res.status(400).json({ message: 'itemsData must be a non-empty array' });
        }
        
        // === START: THAY ĐỔI QUAN TRỌNG: Logic mới để tạo Order và Items ===
        // API này không xử lý tính phí và trừ tiền, nó chỉ tạo đơn hàng ở trạng thái 'pending'
        // Logic tính toán chi phí và người dùng sẽ do các controller khác (admin, client) xử lý
        const newOrder = new Order({
            user: userId || null, // API có thể không có user context
            pricePerItem: 0, // Sẽ được cập nhật sau bởi hệ thống
            totalCost: 0,
            totalItems: itemsData.length
        });

        const itemsToInsert = itemsData.map(data => ({
            orderId: newOrder._id,
            data: data.trim()
        }));

        await Promise.all([
            newOrder.save(),
            Item.insertMany(itemsToInsert)
        ]);
        // === END: THAY ĐỔI QUAN TRỌNG ===
        
        console.log(`[API] Order created: ${newOrder._id}`);
        res.status(201).json({ message: 'Order created and items are queued for processing.', order: newOrder });
    } catch (error) {
        console.error('[API] Error creating order:', error);
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
        const order = await Order.findById(id).lean();
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        // === START: THAY ĐỔI QUAN TRỌNG: Lấy items từ bảng riêng ===
        const items = await Item.find({ orderId: order._id }).lean();
        order.items = items;
        // === END: THAY ĐỔI QUAN TRỌNG ===

        res.status(200).json(order);
    } catch (error) {
        console.error(`[API] Error fetching order ${req.params.id}:`, error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};