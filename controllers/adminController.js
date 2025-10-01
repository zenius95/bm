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
const mongoose = require('mongoose');
const { Parser } = require('json2csv');
const ExcelJS = require('exceljs');

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

    let sumExpression;
    if (sumField === '$metadata.change') {
        sumExpression = {
            $sum: {
                $cond: {
                    if: { $isNumber: "$metadata.change" },
                    then: "$metadata.change",
                    else: { $toDouble: { $ifNull: [ "$metadata.change", 0 ] } }
                }
            }
        };
    } else {
        sumExpression = { $sum: sumField };
    }

    const result = await Model.aggregate([
        { $match: matchCriteria },
        { $group: { _id: null, total: sumExpression } }
    ]);
    
    if (result.length > 0 && result[0].total) {
        if (typeof result[0].total === 'object' && result[0].total.toString) {
            return parseFloat(result[0].total.toString());
        }
        return result[0].total;
    }
    return 0;
};


// Helper for chart data aggregation
const getChartAggregation = async (Model, start, end, sumField, groupByFormat, actionFilter = null) => {
    const matchCriteria = { createdAt: { $gte: start, $lte: end } };
     if (actionFilter) {
        matchCriteria.action = actionFilter;
    }
    
    let valueExpression;
    if (sumField === '$metadata.change') {
         valueExpression = {
            $sum: {
                $cond: {
                    if: { $isNumber: "$metadata.change" },
                    then: "$metadata.change",
                    else: { $toDouble: { $ifNull: [ "$metadata.change", 0 ] } }
                }
            }
        };
    } else {
        valueExpression = { $sum: sumField };
    }

    const aggregationResult = await Model.aggregate([
        { $match: matchCriteria },
        {
            $group: {
                _id: { $dateToString: { format: groupByFormat, date: "$createdAt", timezone: "Asia/Ho_Chi_Minh" } },
                value: valueExpression
            }
        },
        { $sort: { _id: 1 } }
    ]);

    return aggregationResult.map(item => {
        let finalValue = 0;
        if (item.value) {
            if (typeof item.value === 'object' && item.value.toString) {
                finalValue = parseFloat(item.value.toString());
            } else {
                finalValue = item.value;
            }
        }
        return { ...item, value: finalValue };
    });
};

adminOrderController.getDashboard = async (req, res) => {
    try {
        const { period = 'day', chart_month, chart_year } = req.query;
        
        // --- Logic for Top Stat Cards ---
        const { currentRange, previousRange } = getDatesForPeriod(period);
        const depositActions = { $in: ['CLIENT_DEPOSIT', 'CLIENT_DEPOSIT_AUTO', 'ADMIN_ADJUST_BALANCE'] };

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

        // --- Logic for Chart Data (with month/year selector) ---
        const now = new Date();
        const selectedYear = parseInt(chart_year, 10) || now.getFullYear();
        const selectedMonth = parseInt(chart_month, 10) || now.getMonth() + 1;

        const chartEnd = new Date(Date.UTC(selectedYear, selectedMonth - 1, 28, 23, 59, 59, 999));
        const chartStart = new Date(Date.UTC(selectedYear, selectedMonth - 2, 29, 0, 0, 0, 0));


        const revenueData = await getChartAggregation(ActivityLog, chartStart, chartEnd, '$metadata.change', "%Y-%m-%d", depositActions);
        
        const chartTotalRevenue = revenueData.reduce((sum, item) => sum + item.value, 0);

        const dataMap = new Map();
        revenueData.forEach(item => {
            dataMap.set(item._id, { revenue: item.value });
        });
        
        const fullDateRange = [];
        let currentDate = new Date(chartStart);
        while (currentDate <= chartEnd) {
            fullDateRange.push(currentDate.toISOString().split('T')[0]);
            currentDate.setDate(currentDate.getDate() + 1);
        }
        
        let chartData = {
            labels: fullDateRange,
            revenues: fullDateRange.map(date => dataMap.get(date)?.revenue || 0)
        };
        
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
        
        const yearList = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

        res.render('admin/dashboard', { 
            stats,
            chartData,
            detailedStats,
            currentPeriod: period,
            selectedMonth,
            selectedYear,
            yearList,
            chartTotalRevenue,
            chartStartDate: chartStart,
            chartEndDate: chartEnd,
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
        const { page = 1, limit = 20, search, status, inTrash, orderType } = req.query;
        let query = { isDeleted: inTrash === 'true' };

        if (status) {
            query.status = status;
        }

        if (orderType) {
            query.orderType = orderType;
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
            maxItemsPerOrder: settingsService.get('order').maxItemsPerOrder,
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
        order.items = items;

        const logs = await Log.find({ orderId: orderId }).sort({ timestamp: 1 }).lean();

        res.render('admin/order-detail', { 
            order, 
            items,
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
        const { itemsData, userId, orderType } = req.body;
        const adminUserId = req.session.user.id;

        if (!itemsData || itemsData.trim() === '') {
            return res.status(400).json({ success: false, message: "Dữ liệu item trống." });
        }

        const itemLines = itemsData.trim().split('\n').filter(line => line.trim() !== '');
        if (itemLines.length === 0) {
            return res.status(400).json({ success: false, message: "Không có item nào hợp lệ." });
        }

        const { maxItemsPerOrder } = settingsService.get('order');
        if (maxItemsPerOrder > 0 && itemLines.length > maxItemsPerOrder) {
            return res.status(400).json({ success: false, message: `Số lượng items vượt quá giới hạn cho phép (${maxItemsPerOrder}).` });
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
            totalItems: itemLines.length,
            orderType: orderType // Thêm orderType vào đơn hàng mới
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

adminOrderController.getRevenueDetails = async (req, res) => {
    try {
        const { chart_month, chart_year, search } = req.query;
        const now = new Date();
        const selectedYear = parseInt(chart_year, 10) || now.getFullYear();
        const selectedMonth = parseInt(chart_month, 10) || now.getMonth() + 1;

        const chartStart = new Date(Date.UTC(selectedYear, selectedMonth - 2, 29, 0, 0, 0, 0));
        const chartEnd = new Date(Date.UTC(selectedYear, selectedMonth - 1, 28, 23, 59, 59, 999));
        
        const depositActions = { $in: ['CLIENT_DEPOSIT', 'CLIENT_DEPOSIT_AUTO', 'ADMIN_ADJUST_BALANCE'] };

        let query = {
            createdAt: { $gte: chartStart, $lte: chartEnd },
            action: depositActions
        };

        if (search) {
            const users = await User.find({ username: { $regex: search, $options: 'i' } }).select('_id');
            const userIds = users.map(u => u._id);
            query.$or = [
                { 'user': { $in: userIds } },
                { 'details': { $regex: search, $options: 'i' } }
            ];
        }

        const transactions = await ActivityLog.find(query)
        .populate('user', 'username')
        .sort({ createdAt: -1 })
        .lean();

        res.json({ success: true, transactions });

    } catch (error) {
        console.error("Error fetching revenue details:", error);
        res.status(500).json({ success: false, message: 'Could not load revenue details.' });
    }
};

adminOrderController.exportRevenueDetails = async (req, res) => {
    try {
        const { chart_month, chart_year, search, format = 'csv' } = req.query;
        const now = new Date();
        const selectedYear = parseInt(chart_year, 10) || now.getFullYear();
        const selectedMonth = parseInt(chart_month, 10) || now.getMonth() + 1;

        const chartStart = new Date(Date.UTC(selectedYear, selectedMonth - 2, 29, 0, 0, 0, 0));
        const chartEnd = new Date(Date.UTC(selectedYear, selectedMonth - 1, 28, 23, 59, 59, 999));
        
        const depositActions = { $in: ['CLIENT_DEPOSIT', 'CLIENT_DEPOSIT_AUTO', 'ADMIN_ADJUST_BALANCE'] };

        let query = {
            createdAt: { $gte: chartStart, $lte: chartEnd },
            action: depositActions
        };

        if (search) {
            const users = await User.find({ username: { $regex: search, $options: 'i' } }).select('_id');
            const userIds = users.map(u => u._id);
            query.$or = [
                { 'user': { $in: userIds } },
                { 'details': { $regex: search, $options: 'i' } }
            ];
        }

        const transactions = await ActivityLog.find(query)
            .populate('user', 'username')
            .sort({ createdAt: -1 })
            .lean();

        const dataToExport = transactions.map(log => ({
            'Thời gian': new Date(log.createdAt).toLocaleString('vi-VN'),
            'Người dùng': log.user ? log.user.username : 'N/A',
            'Hành động': log.action,
            'Chi tiết': log.details,
            'Số tiền': log.metadata.change || 0
        }));

        if (format === 'csv') {
            const json2csvParser = new Parser();
            const csv = json2csvParser.parse(dataToExport);
            res.header('Content-Type', 'text/csv');
            res.attachment(`doanh-thu-${selectedMonth}-${selectedYear}.csv`);
            res.send(csv);
        } else if (format === 'xlsx') {
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Doanh thu');
            worksheet.columns = [
                { header: 'Thời gian', key: 'Thời gian', width: 25 },
                { header: 'Người dùng', key: 'Người dùng', width: 20 },
                { header: 'Hành động', key: 'Hành động', width: 25 },
                { header: 'Chi tiết', key: 'Chi tiết', width: 50 },
                { header: 'Số tiền', key: 'Số tiền', width: 15, style: { numFmt: '#,##0 "VND"' } }
            ];
            worksheet.addRows(dataToExport);
            res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.attachment(`doanh-thu-${selectedMonth}-${selectedYear}.xlsx`);
            await workbook.xlsx.write(res);
            res.end();
        } else {
            res.status(400).send('Invalid format');
        }

    } catch (error) {
        console.error("Error exporting revenue details:", error);
        res.status(500).send('Could not export revenue details.');
    }
};

module.exports = adminOrderController;