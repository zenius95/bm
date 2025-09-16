// utils/activityLogService.js
const ActivityLog = require('../models/ActivityLog');

const activityLogService = {};

activityLogService.logActivity = async (userId, action, options = {}) => {
    // Thêm 'metadata' vào destructuring
    const { details = '', ipAddress = 'N/A', context = 'Client', metadata = {} } = options;
    try {
        await ActivityLog.create({
            user: userId,
            action,
            details,
            ipAddress,
            context,
            metadata // Thêm metadata vào object được tạo
        });
    } catch (error) {
        console.error('Lỗi khi ghi nhật ký hoạt động:', error);
    }
};

module.exports = activityLogService;