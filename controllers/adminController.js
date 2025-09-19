// controllers/adminController.js
const Order = require('../models/Order');
const Account = require('../models/Account'); 
const Log = require('../models/Log');
const Item = require('../models/Item');
const CrudService = require('../utils/crudService');
const createCrudController = require('./crudController');
const User = require('../models/User'); 
const Proxy = require('../models/Proxy');
const Worker = require('../models/Worker');
const ActivityLog = require('../models/ActivityLog');
const settingsService = require('../utils/settingsService');
const { logActivity } = require('../utils/activityLogService');

const orderService = new CrudService(Order, {
    populateFields: ['user']
});

const adminOrderController = createCrudController(orderService, 'orders', {
    single: 'order',
    plural: 'orders'
});

// Helper to get date ranges
const getDatesForPeriod = (period) => {
    const now = new Date();
    let startOfPeriod = new Date(now);
    let endOfPeriod = new Date(now);
    let startOfPreviousPeriod, endOfPreviousPeriod;

    switch (period) {
        case 'day':
            startOfPeriod.setHours(0, 0, 0, 0);
            endOfPeriod.setHours(23, 59, 59, 999);
            startOfPreviousPeriod = new Date(startOfPeriod);
            startOfPreviousPeriod.setDate(startOfPeriod.getDate() - 1);
            endOfPreviousPeriod = new Date(endOfPeriod);
            endOfPreviousPeriod.setDate(endOfPeriod.getDate() - 1);
            break;
        case 'week':
            const dayOfWeek = now.getDay();
            const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // week starts on Monday
            startOfPeriod = new Date(now.setDate(diff));
            startOfPeriod.setHours(0, 0, 0, 0);
            endOfPeriod = new Date(startOfPeriod);
            endOfPeriod.setDate(startOfPeriod.getDate() + 6);
            endOfPeriod.setHours(23, 59, 59, 999);
            startOfPreviousPeriod = new Date(startOfPeriod);
            startOfPreviousPeriod.setDate(startOfPeriod.getDate() - 7);
            endOfPreviousPeriod = new Date(endOfPeriod);
            endOfPreviousPeriod.setDate(endOfPeriod.getDate() - 7);
            break;
        case 'month':
            startOfPeriod = new Date(now.getFullYear(), now.getMonth(), 1);
            endOfPeriod = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
            startOfPreviousPeriod = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            endOfPreviousPeriod = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
            break;
        case 'year':
            startOfPeriod = new Date(now.getFullYear(), 0, 1);
            endOfPeriod = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
            startOfPreviousPeriod = new Date(now.getFullYear() - 1, 0, 1);
            endOfPreviousPeriod = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
            break;
        default: // 'all'
            return { currentRange: {}, previousRange: {}, startOfPeriod: null, endOfPeriod: null };
    }

    return {
        currentRange: { $gte: startOfPeriod, $lte: endOfPeriod },
        previousRange: { $gte: startOfPreviousPeriod, $lte: endOfPreviousPeriod },
        startOfPeriod,
        endOfPeriod
    };
};

// Helper to calculate percentage change
const calculateChange = (current, previous) => {
    if (previous === 0) {
        return current > 0 ? 100 : 0;
    }
    const change = ((current - previous) / previous) * 100;
    return Math.round(change);
};

// Helper for aggregation pipelines to get totals
const getAggregationData = async (Model, dateRange, sumField, actionFilter = null) => {
    const matchCriteria = dateRange.hasOwnProperty('$gte') ? { createdAt: dateRange } : {};
     if (actionFilter) {
        matchCriteria.action = actionFilter;
    }

    const result = await Model.aggregate([
        { $match: matchCriteria },
        { $group: { _id: null, total: { $sum: sumField } } }
    ]);
    return result.length > 0 ? result[0].total : 0;
};

// Helper for chart data aggregation
const getChartAggregation = async (Model, start, end, sumField, groupByFormat, actionFilter = null) => {
    const matchCriteria = { createdAt: { $gte: start, $lte: end } };
     if (actionFilter) {
        matchCriteria.action = actionFilter;
    }

    return Model.aggregate([
        { $match: matchCriteria },
        {
            $group: {
                _id: { $dateToString: { format: groupByFormat, date: "$createdAt", timezone: "Asia/Ho_Chi_Minh" } },
                value: { $sum: sumField }
            }
        },
        { $sort: { _id: 1 } }
    ]);
};

adminOrderController.getDashboard = async (req, res) => {
    try {
        const currentPeriod = req.query.period || 'day';
        const { currentRange, previousRange, startOfPeriod, endOfPeriod } = getDatesForPeriod(currentPeriod);
        
        const depositActions = { $in: ['CLIENT_DEPOSIT', 'CLIENT_DEPOSIT_AUTO'] };

        // --- Main Stats ---
        const [
            currentRevenue, previousRevenue,
            currentOrders, previousOrders,
            currentNewUsers, previousNewUsers,
            currentCosts, previousCosts
        ] = await Promise.all([
            getAggregationData(ActivityLog, currentRange, '$metadata.change', depositActions),
            getAggregationData(ActivityLog, previousRange, '$metadata.change', depositActions),
            Order.countDocuments(currentRange.hasOwnProperty('$gte') ? { createdAt: currentRange, isDeleted: false } : { isDeleted: false }),
            Order.countDocuments(previousRange.hasOwnProperty('$gte') ? { createdAt: previousRange, isDeleted: false } : { isDeleted: false }),
            User.countDocuments(currentRange.hasOwnProperty('$gte') ? { createdAt: currentRange, isDeleted: false } : { isDeleted: false }),
            User.countDocuments(previousRange.hasOwnProperty('$gte') ? { createdAt: previousRange, isDeleted: false } : { isDeleted: false }),
            getAggregationData(Order, currentRange, '$totalCost'),
            getAggregationData(Order, previousRange, '$totalCost')
        ]);
        
        const stats = {
            revenue: { current: currentRevenue, changePercentage: calculateChange(currentRevenue, previousRevenue) },
            orders: { current: currentOrders, changePercentage: calculateChange(currentOrders, previousOrders) },
            newUsers: { current: currentNewUsers, changePercentage: calculateChange(currentNewUsers, previousNewUsers) },
            costs: { current: currentCosts, changePercentage: calculateChange(currentCosts, previousCosts) }
        };

        // --- Chart Data ---
        let chartData = { labels: [], revenues: [], orders: [], timeUnit: 'day' };
        if (currentPeriod !== 'all') {
             let groupByFormat = "%Y-%m-%d";
             let timeUnit = 'day';
             
             if (currentPeriod === 'year') { 
                groupByFormat = "%Y-%m";
                timeUnit = 'month';
             } else if (currentPeriod === 'month' || currentPeriod === 'week') {
                 groupByFormat = "%Y-%m-%d";
                 timeUnit = 'day';
             }

            const [revenueData, orderData] = await Promise.all([
                getChartAggregation(ActivityLog, startOfPeriod, endOfPeriod, '$metadata.change', groupByFormat, depositActions),
                getChartAggregation(Order, startOfPeriod, endOfPeriod, 1, groupByFormat)
            ]);

            const dataMap = new Map();
            revenueData.forEach(item => {
                if (!dataMap.has(item._id)) dataMap.set(item._id, { revenue: 0, orders: 0 });
                dataMap.get(item._id).revenue = item.value;
            });
            orderData.forEach(item => {
                if (!dataMap.has(item._id)) dataMap.set(item._id, { revenue: 0, orders: 0 });
                dataMap.get(item._id).orders = item.value;
            });

            const sortedLabels = Array.from(dataMap.keys()).sort();

            chartData.labels = sortedLabels;
            chartData.revenues = sortedLabels.map(label => dataMap.get(label).revenue);
            chartData.orders = sortedLabels.map(label => dataMap.get(label).orders);
            chartData.timeUnit = timeUnit;
        }

        // --- Detailed Stats (All time) ---
        const [
            totalAccounts, liveAccounts, dieAccounts, uncheckedAccounts,
            totalProxies, availableProxies, assignedProxies, deadProxies,
            totalWorkers, onlineWorkers
        ] = await Promise.all([
            Account.countDocuments({ isDeleted: false }), Account.countDocuments({ status: 'LIVE', isDeleted: false }),
            Account.countDocuments({ status: 'DIE', isDeleted: false }), Account.countDocuments({ status: 'UNCHECKED', isDeleted: false }),
            Proxy.countDocuments({ isDeleted: false }), Proxy.countDocuments({ status: 'AVAILABLE', isDeleted: false }),
            Proxy.countDocuments({ status: 'ASSIGNED', isDeleted: false }), Proxy.countDocuments({ status: 'DEAD', isDeleted: false }),
            Worker.countDocuments(), Worker.countDocuments({ status: 'online' })
        ]);
        
        const detailedStats = {
            accounts: { total: totalAccounts, live: liveAccounts, die: dieAccounts, unchecked: uncheckedAccounts },
            proxies: { total: totalProxies, available: availableProxies, assigned: assignedProxies, dead: deadProxies },
            workers: { total: totalWorkers, online: onlineWorkers, offline: totalWorkers - onlineWorkers }
        };

        res.render('admin/dashboard', { 
            stats,
            chartData,
            detailedStats,
            currentPeriod,
            title: 'Admin Dashboard',
            page: 'dashboard'
        });
    } catch (error) {
        console.error("Error loading admin dashboard:", error);
        res.status(500).send("Could not load admin dashboard.");
    }
};

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
        
        const items = await Item.find({ orderId: order._id }).lean();
        order.items = items; // Gán items vào order để dùng nếu cần

        const logs = await Log.find({ orderId: orderId }).sort({ timestamp: 1 }).lean();

        res.render('admin/order-detail', { 
            order, 
            items, // <-- THÊM DÒNG NÀY ĐỂ SỬA LỖI
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

adminOrderController.getItemLogs = async (req, res) => {
    try {
        const { itemId } = req.params;
        const logs = await Log.find({ itemId: itemId }).sort({ timestamp: 'asc' }).lean();
        res.json({ success: true, logs });
    } catch (error) {
        console.error(`Error getting logs for item ${req.params.itemId}:`, error);
        res.status(500).json({ success: false, message: 'Lỗi server khi tải logs.' });
    }
};

adminOrderController.handleCreate = async (req, res) => {
    try {
        const { itemsData, userId } = req.body;
        const adminUserId = req.session.user.id;

        if (!itemsData || itemsData.trim() === '') {
            return res.status(400).json({ success: false, message: "Dữ liệu item trống." });
        }

        const itemLines = itemsData.trim().split('\n').filter(line => line.trim() !== '');
        if (itemLines.length === 0) {
            return res.status(400).json({ success: false, message: "Không có item nào hợp lệ." });
        }

        const targetUserId = userId || adminUserId;
        const targetUser = await User.findById(targetUserId);

        if (!targetUser) {
            return res.status(404).json({ success: false, message: "Không tìm thấy người dùng được chọn." });
        }

        const pricePerItem = settingsService.calculatePricePerItem(itemLines.length);
        const totalCost = itemLines.length * pricePerItem;

        if (targetUser.balance < totalCost) {
            return res.status(400).json({ success: false, message: `Số dư của user ${targetUser.username} không đủ. Cần ${totalCost.toLocaleString('vi-VN')}đ, hiện có ${targetUser.balance.toLocaleString('vi-VN')}đ.` });
        }

        const balanceBefore = targetUser.balance;
        targetUser.balance -= totalCost;

        const newOrder = new Order({ 
            user: targetUser._id, 
            totalCost, 
            pricePerItem, 
            totalItems: itemLines.length 
        });

        const itemsToInsert = itemLines.map(line => ({
            orderId: newOrder._id,
            data: line.trim()
        }));

        await Promise.all([
            targetUser.save(),
            newOrder.save(),
            Item.insertMany(itemsToInsert)
        ]);

        await logActivity(targetUser._id, 'ADMIN_CREATE_ORDER', {
            details: `Tạo đơn hàng #${newOrder.shortId} bởi Admin '${req.session.user.username}' với ${itemLines.length} items.`,
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

module.exports = adminOrderController;