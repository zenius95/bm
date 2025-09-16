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
        const { page = 1, limit = 20, search, status, inTrash } = req.query;
        let query = { isDeleted: inTrash === 'true' };

        if (status) {
            query.status = status;
        }

        if (search) {
            const users = await User.find({ username: { $regex: search, $options: 'i' } }).select('_id');
            const userIds = users.map(u => u._id);
            
            query.$or = [
                { shortId: { $regex: search, $options: 'i' } },
                { user: { $in: userIds } }
            ];
        }

        const totalItems = await Order.countDocuments(query);
        const orders = await Order.find(query)
            .sort({ createdAt: -1 })
            .skip((parseInt(page, 10) - 1) * parseInt(limit, 10))
            .limit(parseInt(limit, 10))
            .populate('user', 'username')
            .lean();
        
        const trashCount = await Order.countDocuments({ isDeleted: true });
        const usersForForm = await User.find({ isDeleted: false }).select('username balance').lean();

        orders.forEach(order => {
            order.completedItems = order.items.filter(item => item.status === 'completed').length;
            order.failedItems = order.items.filter(item => item.status === 'failed').length;
        });

        const title = 'Orders Management';
        const pagination = {
            totalItems,
            currentPage: parseInt(page, 10),
            totalPages: Math.ceil(totalItems / limit),
            limit: parseInt(limit, 10),
        };

        res.render('admin/orders', { 
            orders: orders, 
            pagination,
            trashCount,
            users: usersForForm,
            pricingTiers: settingsService.get('order').pricingTiers,
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
            title: `Order #${order.shortId}`,
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

        // === START: THAY ĐỔI CÁCH TÍNH GIÁ ===
        const pricePerItem = settingsService.calculatePricePerItem(items.length);
        const totalCost = items.length * pricePerItem;
        // === END: THAY ĐỔI CÁCH TÍNH GIÁ ===

        if (targetUser.balance < totalCost) {
            return res.status(400).json({ success: false, message: `Số dư của user ${targetUser.username} không đủ. Cần ${totalCost.toLocaleString('vi-VN')}đ, hiện có ${targetUser.balance.toLocaleString('vi-VN')}đ.` });
        }

        const balanceBefore = targetUser.balance;
        targetUser.balance -= totalCost;
        await targetUser.save();

        const newOrder = { user: targetUser._id, items, totalCost, pricePerItem };
        const createdOrder = await orderService.create(newOrder);

        await logActivity(targetUser._id, 'ADMIN_CREATE_ORDER', {
            details: `Tạo đơn hàng #${createdOrder.shortId} bởi Admin '${req.session.user.username}' với ${items.length} items.`,
            ipAddress: req.ip || req.connection.remoteAddress,
            context: 'Admin',
            metadata: {
                balanceBefore: balanceBefore,
                balanceAfter: targetUser.balance,
                change: -totalCost
            }
        });

        const [ totalOrderCount, processingOrderCount ] = await Promise.all([
             Order.countDocuments({ isDeleted: false }),
             Order.countDocuments({ status: { $in: ['pending', 'processing'] }, isDeleted: false })
        ]);
        req.io.emit('dashboard:stats:update', { 
            orderStats: { total: totalOrderCount, processing: processingOrderCount }
        });

        return res.json({ success: true, message: `Đã tạo thành công đơn hàng và trừ ${totalCost.toLocaleString('vi-VN')}đ từ tài khoản ${targetUser.username}.` });

    } catch (error) {
        console.error("Error creating order from admin:", error);
        return res.status(500).json({ success: false, message: "Lỗi server khi tạo đơn hàng." });
    }
};

// Ghi đè các hàm xóa để thêm log
const originalSoftDelete = adminOrderController.handleSoftDelete;
adminOrderController.handleSoftDelete = async (req, res, next) => {
    const { ids, selectAll } = req.body;
    const count = selectAll ? 'tất cả' : ids.length;
    await originalSoftDelete(req, res, next);
    await logActivity(req.session.user.id, 'ADMIN_SOFT_DELETE_ORDERS', {
        details: `Admin '${req.session.user.username}' đã chuyển ${count} đơn hàng vào thùng rác.`,
        ipAddress: req.ip || req.connection.remoteAddress,
        context: 'Admin'
    });
};

const originalRestore = adminOrderController.handleRestore;
adminOrderController.handleRestore = async (req, res, next) => {
    const { ids, selectAll } = req.body;
    const count = selectAll ? 'tất cả' : ids.length;
    await originalRestore(req, res, next);
    await logActivity(req.session.user.id, 'ADMIN_RESTORE_ORDERS', {
        details: `Admin '${req.session.user.username}' đã khôi phục ${count} đơn hàng.`,
        ipAddress: req.ip || req.connection.remoteAddress,
        context: 'Admin'
    });
};

const originalHardDelete = adminOrderController.handleHardDelete;
adminOrderController.handleHardDelete = async (req, res, next) => {
    const { ids, selectAll } = req.body;
    const count = selectAll ? 'tất cả' : ids.length;
    await originalHardDelete(req, res, next);
    await logActivity(req.session.user.id, 'ADMIN_HARD_DELETE_ORDERS', {
        details: `Admin '${req.session.user.username}' đã xóa vĩnh viễn ${count} đơn hàng.`,
        ipAddress: req.ip || req.connection.remoteAddress,
        context: 'Admin'
    });
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