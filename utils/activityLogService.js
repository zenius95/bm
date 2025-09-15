// utils/activityLogService.js
const ActivityLog = require('../models/ActivityLog');

const activityLogService = {};

/**
 * Ghi lại một hoạt động của người dùng vào nhật ký.
 * @param {string | mongoose.Types.ObjectId} userId - ID của người dùng.
 * @param {string} action - Mã hành động (ví dụ: 'USER_LOGIN').
 * @param {Object} options - Các tùy chọn bổ sung.
 * @param {string} [options.details=''] - Chi tiết hành động.
 * @param {string} [options.ipAddress='N/A'] - Địa chỉ IP.
 * @param {'Admin' | 'Client'} [options.context='Client'] - Ngữ cảnh thực hiện.
 */
activityLogService.logActivity = async (userId, action, options = {}) => {
    const { details = '', ipAddress = 'N/A', context = 'Client' } = options;
    try {
        await ActivityLog.create({
            user: userId,
            action,
            details,
            ipAddress,
            context
        });
    } catch (error) {
        console.error('Lỗi khi ghi nhật ký hoạt động:', error);
    }
};

module.exports = activityLogService;