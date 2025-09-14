// controllers/adminController.js
const Order = require('../models/Order');
const Log = require('../models/Log'); // Import Log

exports.getDashboard = async (req, res) => {
    try {
        // Lấy các số liệu thống kê
        const total = Order.countDocuments({});
        const processing = Order.countDocuments({ status: { $in: ['pending', 'processing'] } });
        const completed = Order.countDocuments({ status: 'completed' });
        const failed = Order.countDocuments({ status: 'failed' });

        // Lấy 20 đơn hàng gần nhất
        const recentOrdersQuery = Order.find({})
            .sort({ createdAt: -1 })
            .limit(20)
            .lean();

        // Chạy các query song song
        const [totalCount, processingCount, completedCount, failedCount, orders] = await Promise.all([
            total, processing, completed, failed, recentOrdersQuery
        ]);

        const stats = {
            total: totalCount,
            processing: processingCount,
            completed: completedCount,
            failed: failedCount,
        };
        
        // Thêm bộ đếm cho mỗi đơn hàng
        orders.forEach(order => {
            order.completedItems = 0;
            order.failedItems = 0;
            order.items.forEach(item => {
                if (item.status === 'completed') order.completedItems++;
                else if (item.status === 'failed') order.failedItems++;
            });
        });

        res.render('dashboard', { stats, orders });

    } catch (error) {
        console.error("Error loading admin dashboard:", error);
        res.status(500).send("Could not load admin dashboard.");
    }
};

// Hàm mới để lấy chi tiết đơn hàng
exports.getOrderDetail = async (req, res) => {
    try {
        const { id } = req.params;
        
        const order = await Order.findById(id).lean();
        if (!order) {
            return res.status(404).send("Order not found.");
        }

        const logs = await Log.find({ orderId: id }).sort({ timestamp: 1 });

        res.render('order-detail', { order, logs });

    } catch (error) {
        console.error("Error loading order detail:", error);
        res.status(500).send("Could not load order details.");
    }
};