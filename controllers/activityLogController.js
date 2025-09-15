// controllers/activityLogController.js
const ActivityLog = require('../models/ActivityLog');
const CrudService = require('../utils/crudService');
const createCrudController = require('./crudController');

// Khởi tạo service cho ActivityLog
const activityLogService = new CrudService(ActivityLog, {
    searchableFields: ['action', 'details', 'ipAddress']
});

// Tạo controller bằng factory
const activityLogController = createCrudController(activityLogService, 'activity-logs', {
    single: 'log',
    plural: 'logs'
});

// Ghi đè lại hàm getAll để populate thông tin user
activityLogController.handleGetAll = async (req, res) => {
    try {
        const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
        const queryOptions = { page, limit, sortBy, sortOrder, ...req.query };

        const query = activityLogService._buildQuery(queryOptions);
        
        const sortOptions = { [sortBy]: sortOrder === 'asc' ? 1 : -1, _id: -1 };
        const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

        const totalItems = await ActivityLog.countDocuments(query);
        const logs = await ActivityLog.find(query)
            .populate('user', 'username') // Lấy username từ collection User
            .sort(sortOptions)
            .skip(skip)
            .limit(parseInt(limit, 10))
            .lean();

        const pagination = {
            totalItems,
            currentPage: parseInt(page, 10),
            totalPages: Math.ceil(totalItems / limit),
            limit: parseInt(limit, 10),
        };

        res.render('admin/activity-logs', { 
            logs, 
            pagination, 
            currentQuery: req.query,
            title: 'Nhật ký hoạt động',
            page: 'activity-logs'
        });
    } catch (error) {
        console.error(`Lỗi khi lấy nhật ký hoạt động:`, error);
        res.status(500).send(`Không thể tải nhật ký hoạt động.`);
    }
};


module.exports = activityLogController;