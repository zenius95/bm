// controllers/adminController.js
const Order = require('../models/Order');
const Account = require('../models/Account'); 
const Log = require('../models/Log');
const CrudService = require('../utils/crudService');
const createCrudController = require('./crudController');
const User = require('../models/User'); 
const settingsService = require('../utils/settingsService');
const { logActivity } = require('../utils/activityLogService');

const orderService = new CrudService(Order, {
    populateFields: { path: 'user', select: 'username' }
});

const adminOrderController = createCrudController(orderService, 'orders', {
    single: 'order',
    plural: 'orders'
});

adminOrderController.handleGetAll = async (req, res) => {
    try {
        const { data, pagination } = await orderService.find(req.query);
        const trashCount = await orderService.Model.countDocuments({ isDeleted: true });
        
        const users = await User.find({ isDeleted: false }).select('username balance').lean();

        data.forEach(order => {
            order.completedItems = order.items.filter(item => item.status === 'completed').length;
            order.failedItems = order.items.filter(item => item.status === 'failed').length;
        });

        const title = 'Orders Management';

        res.render('admin/orders', { 
            orders: data, 
            pagination,
            trashCount,
            users,
            currentPricePerItem: settingsService.get('order').pricePerItem,
            title,
            page: 'orders',
            currentQuery: res.locals.currentQuery
        });
    } catch (error) {
        console.error(`Error getting all orders:`, error);
        res.status(500).send(`Could not load orders.`);
    }
};

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
        const { itemsData, userId } = req.body;
        const adminUserId = req.session.user.id;

        if (!itemsData || itemsData.trim() === '') {
            return res.status(400).json({ success: false, message: "Dữ liệu item trống." });
        }

        const items = itemsData.trim().split('\n').filter(line => line.trim() !== '').map(line => ({
            data: line.trim(),
            status: 'queued'
        }));

        if (items.length === 0) {
            return res.status(400).json({ success: false, message: "Không có item nào hợp lệ." });
        }

        const targetUserId = userId || adminUserId;
        const targetUser = await User.findById(targetUserId);

        if (!targetUser) {
            return res.status(404).json({ success: false, message: "Không tìm thấy người dùng được chọn." });
        }

        const pricePerItem = settingsService.get('order').pricePerItem;
        const totalCost = items.length * pricePerItem;

        if (targetUser.balance < totalCost) {
            return res.status(400).json({ success: false, message: `Số dư của user ${targetUser.username} không đủ. Cần ${totalCost.toLocaleString('vi-VN')}đ, hiện có ${targetUser.balance.toLocaleString('vi-VN')}đ.` });
        }

        targetUser.balance -= totalCost;
        await targetUser.save();

        const newOrder = {
            user: targetUser._id,
            items,
            totalCost,
            pricePerItem
        };
        const createdOrder = await orderService.create(newOrder);

        const ipAddress = req.ip || req.connection.remoteAddress;
        await logActivity(adminUserId, 'ADMIN_CREATE_ORDER', {
            details: `Admin '${req.session.user.username}' đã tạo đơn hàng #${createdOrder._id.toString().slice(-6)} cho user '${targetUser.username}' với ${items.length} items, tổng chi phí ${totalCost.toLocaleString('vi-VN')}đ.`,
            ipAddress,
            context: 'Admin'
        });

        // === START: THAY ĐỔI QUAN TRỌNG ===
        // Gửi sự kiện cập nhật dashboard ngay lập tức
        const [ totalOrderCount, processingOrderCount ] = await Promise.all([
             Order.countDocuments({ isDeleted: false }),
             Order.countDocuments({ status: { $in: ['pending', 'processing'] }, isDeleted: false })
        ]);
        req.io.emit('dashboard:stats:update', { 
            orderStats: {
                total: totalOrderCount,
                processing: processingOrderCount
            }
        });
        // === END: THAY ĐỔI QUAN TRỌNG ===

        return res.json({ success: true, message: `Đã tạo thành công đơn hàng và trừ ${totalCost.toLocaleString('vi-VN')}đ từ tài khoản ${targetUser.username}.` });

    } catch (error) {
        console.error("Error creating order from admin:", error);
        return res.status(500).json({ success: false, message: "Lỗi server khi tạo đơn hàng." });
    }
};


adminOrderController.getDashboard = async (req, res) => {
    try {
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
            Order.find({ isDeleted: false }).sort({ createdAt: -1 }).limit(10).populate('user', 'username').lean()
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