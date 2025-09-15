// utils/activityLogService.js
const ActivityLog = require('../models/ActivityLog');

const activityLogService = {};

/**
 * Ghi lại một hoạt động của người dùng vào nhật ký.
 * @param {string | mongoose.Types.ObjectId} userId - ID của người dùng thực hiện hành động.
 * @param {string} action - Mô tả ngắn gọn hành động (ví dụ: 'USER_LOGIN', 'PROFILE_UPDATE').
 * @param {string} [details=''] - Thông tin chi tiết về hành động.
 * @param {string} [ipAddress='N/A'] - Địa chỉ IP của người dùng.
 */
activityLogService.logActivity = async (userId, action, details = '', ipAddress = 'N/A') => {
    try {
        await ActivityLog.create({
            user: userId,
            action,
            details,
            ipAddress
        });
    } catch (error) {
        console.error('Lỗi khi ghi nhật ký hoạt động:', error);
    }
};

module.exports = activityLogService;