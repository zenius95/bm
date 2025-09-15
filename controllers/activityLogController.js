// controllers/activityLogController.js
const ActivityLog = require('../models/ActivityLog');
const CrudService = require('../utils/crudService');
const createCrudController = require('./crudController');

// Định nghĩa nhãn cho các hành động
const ACTION_LABELS = {
    'USER_LOGIN': { label: 'Đăng nhập', color: 'bg-green-500/20 text-green-400' },
    'USER_LOGOUT': { label: 'Đăng xuất', color: 'bg-gray-500/20 text-gray-300' },
    'PROFILE_UPDATE': { label: 'Cập nhật hồ sơ', color: 'bg-blue-500/20 text-blue-400' },
    'ADMIN_CREATE_USER': { label: 'Tạo người dùng', color: 'bg-yellow-500/20 text-yellow-400' },
    'ADMIN_ADJUST_BALANCE': { label: 'Thay đổi số dư', color: 'bg-purple-500/20 text-purple-400' },
};

const activityLogService = new CrudService(ActivityLog, {
    searchableFields: ['details', 'ipAddress'] // Chỉ tìm trong chi tiết và IP
});

const activityLogController = createCrudController(activityLogService, 'activity-logs', {
    single: 'log',
    plural: 'logs'
});

activityLogController.handleGetAll = async (req, res) => {
    try {
        const { page = 1, limit = 20, searchUser, searchAction } = req.query;
        let query = { isDeleted: { $ne: true } };

        // Lọc theo username
        if (searchUser) {
            const users = await require('../models/User').find({ username: { $regex: searchUser, $options: 'i' } }).select('_id');
            const userIds = users.map(u => u._id);
            query.user = { $in: userIds };
        }

        // Lọc theo nội dung hành động (details)
        if (searchAction) {
            query.details = { $regex: searchAction, $options: 'i' };
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

module.exports = activityLogController;