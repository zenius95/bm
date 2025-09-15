// controllers/adminController.js
const Order = require('../models/Order');
const Account = require('../models/Account'); 
const Log = require('../models/Log');
const CrudService = require('../utils/crudService');
const createCrudController = require('./crudController');

const orderService = new CrudService(Order, {});

const adminOrderController = createCrudController(orderService, 'orders', {
    single: 'order',
    plural: 'orders'
});

adminOrderController.handleGetById = async (req, res) => {
    try {
        const orderId = req.params.id;
        const order = await orderService.getById(orderId);
        if (!order) {
            return res.status(404).send("Order not found.");
        }
        const logs = await Log.find({ orderId: orderId }).sort({ timestamp: 1 });
        res.render('admin/order-detail', { 
            order, 
            logs, 
            currentQuery: req.query,
            title: `Order #${order._id.toString().slice(-6)}`,
            page: 'orders'
        });
    } catch (error) {
        console.error(`Error getting order by id:`, error);
        res.status(500).send(`Could not load order detail.`);
    }
};

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
            await orderService.create({ items });
            return res.json({ success: true, message: `Đã tạo thành công đơn hàng với ${items.length} item.` });
        }
         return res.status(400).json({ success: false, message: "Không có item nào hợp lệ." });
    } catch (error) {
        console.error("Error creating order from admin:", error);
        return res.status(500).json({ success: false, message: "Lỗi server khi tạo đơn hàng." });
    }
};

adminOrderController.getDashboard = async (req, res) => {
    try {
        const User = require('../models/User'); 
        const [
            totalOrderCount, processingOrderCount, completedOrderCount, failedOrderCount,
            totalAccountCount, liveAccountCount, dieAccountCount, uncheckedAccountCount,
            totalUserCount, adminUserCount,
            orders
        ] = await Promise.all([
            Order.countDocuments({ isDeleted: false }),
            Order.countDocuments({ status: { $in: ['pending', 'processing'] }, isDeleted: false }),
            Order.countDocuments({ status: 'completed', isDeleted: false }),
            Order.countDocuments({ status: 'failed', isDeleted: false }),
            Account.countDocuments({ isDeleted: false }),
            Account.countDocuments({ status: 'LIVE', isDeleted: false }),
            Account.countDocuments({ status: 'DIE', isDeleted: false }),
            Account.countDocuments({ status: 'UNCHECKED', isDeleted: false }),
            User.countDocuments({ isDeleted: false }),
            User.countDocuments({ role: 'admin', isDeleted: false }),
            Order.find({ isDeleted: false }).sort({ createdAt: -1 }).limit(10).lean()
        ]);

        const orderStats = { total: totalOrderCount, processing: processingOrderCount, completed: completedOrderCount, failed: failedOrderCount };
        const accountStats = { total: totalAccountCount, live: liveAccountCount, die: dieAccountCount, unchecked: uncheckedAccountCount };
        const userStats = { total: totalUserCount, admins: adminUserCount, users: totalUserCount - adminUserCount };

        orders.forEach(order => {
            order.completedItems = order.items.filter(item => item.status === 'completed').length;
            order.failedItems = order.items.filter(item => item.status === 'failed').length;
        });

        res.render('admin/dashboard', { 
            orderStats, 
            accountStats, 
            userStats, 
            orders, 
            currentQuery: req.query,
            title: 'Admin Dashboard',
            page: 'dashboard'
        });
    } catch (error) {
        console.error("Error loading admin dashboard:", error);
        res.status(500).send("Could not load admin dashboard.");
    }
};

module.exports = adminOrderController;