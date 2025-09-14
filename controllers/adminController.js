// controllers/adminController.js
const Order = require('../models/Order');
const CrudService = require('../utils/crudService');
const createCrudController = require('./crudController');
const { orderQueue } = require('../queue');

// 1. Khởi tạo Service cho Order
const orderService = new CrudService(Order, {
    // Order không cần tìm kiếm text
});

// 2. Tạo Controller từ Factory
const orderController = createCrudController(orderService, 'orders', {
    single: 'order',
    plural: 'orders'
});

// 3. Override hoặc thêm các logic đặc thù
orderController.handleCreate = async (req, res) => {
    try {
        const { itemsData } = req.body;
        if (!itemsData || itemsData.trim() === '') {
            return res.redirect('/admin/orders');
        }
        const items = itemsData.trim().split('\n').map(line => ({
            data: line.trim(), status: 'queued'
        }));
        if (items.length > 0) {
            const order = await orderService.create({ items });
            await orderQueue.add('process-order', { orderId: order._id });
        }
        res.redirect('/admin/orders');
    } catch (error) {
        console.error("Error creating order from admin:", error);
        res.status(500).send("Failed to create order.");
    }
};

// Logic cho trang dashboard (giữ nguyên từ file cũ)
orderController.getDashboard = async (req, res) => {
    try {
        const total = Order.countDocuments({ isDeleted: false });
        const processing = Order.countDocuments({ status: { $in: ['pending', 'processing'] }, isDeleted: false });
        const completed = Order.countDocuments({ status: 'completed', isDeleted: false });
        const failed = Order.countDocuments({ status: 'failed', isDeleted: false });

        const recentOrdersQuery = Order.find({ isDeleted: false })
            .sort({ createdAt: -1 })
            .limit(20)
            .lean();

        const [totalCount, processingCount, completedCount, failedCount, orders] = await Promise.all([
            total, processing, completed, failed, recentOrdersQuery
        ]);

        const stats = {
            total: totalCount,
            processing: processingCount,
            completed: completedCount,
            failed: failedCount,
        };
        
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

module.exports = orderController;