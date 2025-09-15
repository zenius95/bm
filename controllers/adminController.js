// controllers/adminController.js
const Order = require('../models/Order');
const Account = require('../models/Account'); // Import model Account
const Log = require('../models/Log');
const CrudService = require('../utils/crudService');
const createCrudController = require('./crudController');

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
        const logs = await Log.find({ orderId: orderId }).sort({ timestamp: 1 });
        res.render('admin/order-detail', { order, logs, currentQuery: req.query });
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
            // Không cần thêm vào queue nữa
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
        const User = require('../models/User'); // Import User model ở đây

        // Stats cho Order
        const totalOrders = Order.countDocuments({ isDeleted: false });
        const processingOrders = Order.countDocuments({ status: { $in: ['pending', 'processing'] }, isDeleted: false });
        const completedOrders = Order.countDocuments({ status: 'completed', isDeleted: false });
        const failedOrders = Order.countDocuments({ status: 'failed', isDeleted: false });

        // Stats cho Account
        const totalAccounts = Account.countDocuments({ isDeleted: false });
        const liveAccounts = Account.countDocuments({ status: 'LIVE', isDeleted: false });
        const dieAccounts = Account.countDocuments({ status: 'DIE', isDeleted: false });
        const uncheckedAccounts = Account.countDocuments({ status: 'UNCHECKED', isDeleted: false });
        
        // === START: THÊM THỐNG KÊ USER ===
        const totalUsers = User.countDocuments({ isDeleted: false });
        const adminUsers = User.countDocuments({ role: 'admin', isDeleted: false });
        // === END: THÊM THỐNG KÊ USER ===

        const recentOrdersQuery = Order.find({ isDeleted: false })
            .sort({ createdAt: -1 })
            .limit(20)
            .lean();

        const [
            totalOrderCount, processingOrderCount, completedOrderCount, failedOrderCount,
            totalAccountCount, liveAccountCount, dieAccountCount, uncheckedAccountCount,
            totalUserCount, adminUserCount, // Thêm biến mới
            orders
        ] = await Promise.all([
            totalOrders, processingOrders, completedOrders, failedOrders,
            totalAccounts, liveAccounts, dieAccounts, uncheckedAccounts,
            totalUsers, adminUsers, // Thêm tác vụ mới
            recentOrdersQuery
        ]);

        const orderStats = {
            total: totalOrderCount,
            processing: processingOrderCount,
            completed: completedOrderCount,
            failed: failedOrderCount,
        };
        
        const accountStats = {
            total: totalAccountCount,
            live: liveAccountCount,
            die: dieAccountCount,
            unchecked: uncheckedAccountCount
        };
        
        // === START: THÊM THỐNG KÊ USER ===
        const userStats = {
            total: totalUserCount,
            admins: adminUserCount,
            users: totalUserCount - adminUserCount
        };
        // === END: THÊM THỐNG KÊ USER ===

        orders.forEach(order => {
            order.completedItems = 0;
            order.failedItems = 0;
            order.items.forEach(item => {
                if (item.status === 'completed') order.completedItems++;
                else if (item.status === 'failed') order.failedItems++;
            });
        });

        // Truyền userStats vào view
        res.render('admin/dashboard', { orderStats, accountStats, userStats, orders, currentQuery: req.query });

    } catch (error) {
        console.error("Error loading admin dashboard:", error);
        res.status(500).send("Could not load admin dashboard.");
    }
};

module.exports = adminOrderController;