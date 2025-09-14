// controllers/adminController.js
const Order = require('../models/Order');
const CrudService = require('../utils/crudService');
const createCrudController = require('./crudController');
const { orderQueue } = require('../queue');

const orderService = new CrudService(Order, {});

const orderController = createCrudController(orderService, 'orders', {
    single: 'order',
    plural: 'orders'
});

orderController.handleCreate = async (req, res) => {
    try {
        const { itemsData } = req.body;
        if (!itemsData || itemsData.trim() === '') {
            return res.status(400).json({ success: false, message: "Dữ liệu item trống." });
        }
        const items = itemsData.trim().split('\n').map(line => ({
            data: line.trim(), status: 'queued'
        }));

        if (items.length > 0) {
            const order = await orderService.create({ items });
            await orderQueue.add('process-order', { orderId: order._id });
            return res.json({ success: true, message: `Đã tạo thành công đơn hàng với ${items.length} item.` });
        }
        return res.status(400).json({ success: false, message: "Không có item nào hợp lệ." });
    } catch (error) {
        console.error("Error creating order from admin:", error);
        return res.status(500).json({ success: false, message: "Lỗi server khi tạo đơn hàng." });
    }
};

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