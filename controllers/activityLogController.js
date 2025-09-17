// controllers/activityLogController.js
const ActivityLog = require('../models/ActivityLog');
const CrudService = require('../utils/crudService');
const createCrudController = require('./crudController');

// Định nghĩa nhãn cho các hành động
const ACTION_LABELS = {
    // Client Actions
    'USER_LOGIN': { label: 'Đăng nhập', color: 'bg-green-500/20 text-green-400' },
    'USER_LOGOUT': { label: 'Đăng xuất', color: 'bg-gray-500/20 text-gray-300' },
    'USER_REGISTER': { label: 'Đăng ký', color: 'bg-sky-500/20 text-sky-400' },
    'PROFILE_UPDATE': { label: 'Cập nhật Hồ sơ', color: 'bg-blue-500/20 text-blue-400' },
    'CLIENT_CREATE_ORDER': { label: 'Tạo Đơn hàng', color: 'bg-cyan-500/20 text-cyan-400' },
    'CLIENT_DEPOSIT': { label: 'Nạp tiền', color: 'bg-emerald-500/20 text-emerald-400' },
    'CLIENT_DEPOSIT_AUTO': { label: 'Nạp tiền Tự động', color: 'bg-teal-500/20 text-teal-400' },
    'ORDER_REFUND': { label: 'Hoàn tiền Đơn hàng', color: 'bg-orange-500/20 text-orange-400' },

    // Admin Actions: Users
    'ADMIN_CREATE_USER': { label: 'Tạo User', color: 'bg-teal-500/20 text-teal-400' },
    'ADMIN_UPDATE_USER': { label: 'Cập nhật User', color: 'bg-blue-500/20 text-blue-400' },
    'ADMIN_ADJUST_BALANCE': { label: 'Thay đổi Số dư', color: 'bg-purple-500/20 text-purple-400' },
    'ADMIN_DELETE_USER': { label: 'Xóa User', color: 'bg-red-500/20 text-red-400' },
    
    // Admin Actions: Orders
    'ADMIN_CREATE_ORDER': { label: 'Tạo Đơn hàng', color: 'bg-cyan-500/20 text-cyan-400' },
    'ADMIN_SOFT_DELETE_ORDERS': { label: 'Xóa mềm Đơn hàng', color: 'bg-yellow-500/20 text-yellow-400' },
    'ADMIN_RESTORE_ORDERS': { label: 'Khôi phục Đơn hàng', color: 'bg-lime-500/20 text-lime-400' },
    'ADMIN_HARD_DELETE_ORDERS': { label: 'Xóa vĩnh viễn Đơn hàng', color: 'bg-red-500/20 text-red-400' },

    // Admin Actions: Accounts
    'ADMIN_ADD_ACCOUNTS': { label: 'Thêm Accounts', color: 'bg-indigo-500/20 text-indigo-400' },
    'ADMIN_SOFT_DELETE_ACCOUNTS': { label: 'Xóa mềm Accounts', color: 'bg-yellow-500/20 text-yellow-400' },
    'ADMIN_RESTORE_ACCOUNTS': { label: 'Khôi phục Accounts', color: 'bg-lime-500/20 text-lime-400' },
    'ADMIN_HARD_DELETE_ACCOUNTS': { label: 'Xóa vĩnh viễn Accounts', color: 'bg-red-500/20 text-red-400' },
    'ADMIN_MANUAL_CHECKLIVE': { label: 'Check Live Thủ công', color: 'bg-green-500/20 text-green-400' },
    
    // Admin Actions: Workers & Settings
    'ADMIN_ADD_WORKER': { label: 'Thêm Worker', color: 'bg-fuchsia-500/20 text-fuchsia-400' },
    'ADMIN_UPDATE_WORKER': { label: 'Cập nhật Worker', color: 'bg-blue-500/20 text-blue-400' },
    'ADMIN_DELETE_WORKER': { label: 'Xóa Worker', color: 'bg-red-500/20 text-red-400' },
    'ADMIN_TOGGLE_WORKER': { label: 'Bật/Tắt Worker', color: 'bg-yellow-500/20 text-yellow-400' },
    'ADMIN_UPDATE_SETTINGS': { label: 'Cập nhật Cài đặt', color: 'bg-rose-500/20 text-rose-400' },
};

const activityLogService = new CrudService(ActivityLog, {
    searchableFields: ['details', 'ipAddress']
});

const activityLogController = createCrudController(activityLogService, 'activity-logs', {
    single: 'log',
    plural: 'logs'
});

activityLogController.handleGetAll = async (req, res) => {
    try {
        const { page = 1, limit = 20, searchUser, searchDetails, searchContext, searchAction } = req.query;
        let query = {}; 

        if (searchUser) {
            const users = await require('../models/User').find({ username: { $regex: searchUser, $options: 'i' } }).select('_id');
            const userIds = users.map(u => u._id);
            query.user = { $in: userIds };
        }

        if (searchDetails) {
            query.details = { $regex: searchDetails, $options: 'i' };
        }
        
        if (searchContext) {
            query.context = searchContext;
        }

        if (searchAction) {
            query.action = searchAction;
        }

        const totalItems = await ActivityLog.countDocuments(query);
        const logs = await ActivityLog.find(query)
            .populate('user', 'username')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .lean();

        const pagination = {
            totalItems,
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalItems / limit),
            limit: parseInt(limit),
        };

        res.render('admin/activity-logs', { 
            logs, 
            pagination, 
            currentQuery: req.query,
            title: 'Nhật ký hoạt động',
            page: 'activity-logs',
            actionLabels: ACTION_LABELS
        });
    } catch (error) {
        console.error(`Lỗi khi lấy nhật ký hoạt động:`, error);
        res.status(500).send(`Không thể tải nhật ký hoạt động.`);
    }
};

activityLogController.getTransactionLogs = async (req, res) => {
    try {
        const { page = 1, limit = 20, searchUser, searchAction } = req.query;
        const transactionActions = [
            'ADMIN_ADJUST_BALANCE', 
            'ORDER_REFUND', 
            'CLIENT_DEPOSIT',
            'CLIENT_CREATE_ORDER',
            'ADMIN_CREATE_ORDER',
            'CLIENT_DEPOSIT_AUTO'
        ];
        let query = { action: { $in: transactionActions } }; 

        if (searchUser) {
            const users = await require('../models/User').find({ username: { $regex: searchUser, $options: 'i' } }).select('_id');
            const userIds = users.map(u => u._id);
            query.user = { $in: userIds };
        }

        if (searchAction) {
            query.action = searchAction;
        }

        const totalItems = await ActivityLog.countDocuments(query);
        const logs = await ActivityLog.find(query)
            .populate('user', 'username')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .lean();

        const pagination = {
            totalItems,
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalItems / limit),
            limit: parseInt(limit),
        };

        const relevantActionLabels = Object.fromEntries(
            Object.entries(ACTION_LABELS).filter(([key]) => transactionActions.includes(key))
        );

        res.render('admin/transactions', { 
            logs, 
            pagination, 
            currentQuery: req.query,
            title: 'Lịch sử giao dịch',
            page: 'transactions',
            actionLabels: relevantActionLabels
        });
    } catch (error) {
        console.error(`Lỗi khi lấy lịch sử giao dịch:`, error);
        res.status(500).send(`Không thể tải lịch sử giao dịch.`);
    }
};

module.exports = activityLogController;