// controllers/adminController.js
const Order = require('../models/Order');
const Log = require('../models/Log');
const CrudService = require('../utils/crudService');
const createCrudController = require('./crudController');
const { orderQueue } = require('../queue');

// 1. Khởi tạo Service cho Order
const orderService = new CrudService(Order, {
    // Order không cần tìm kiếm text
});

// 2. Tạo Controller từ Factory
const adminOrderController = createCrudController(orderService, 'orders', {
    single: 'order',
    plural: 'orders'
});

// 3. Ghi đè lại hàm handleGetById để trỏ đúng view và lấy thêm Log
adminOrderController.handleGetById = async (req, res) => {
    try {
        const orderId = req.params.id;
        const order = await orderService.getById(orderId);
        if (!order) {
            return res.status(404).send("Order not found.");
        }
        // Lấy thêm logs cho trang chi tiết
        const logs = await Log.find({ orderId: orderId }).sort({ timestamp: 1 });

        // Render đúng file view 'order-detail.ejs'
        res.render('order-detail', { order, logs });

    } catch (error) {
        console.error(`Error getting order by id:`, error);
        res.status(500).send(`Could not load order detail.`);
    }
};

// 4. Override hoặc thêm các logic đặc thù khác
adminOrderController.handleCreate = async (req, res) => {
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

// Logic cho trang dashboard
adminOrderController.getDashboard = async (req, res) => {
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

module.exports = adminOrderController;