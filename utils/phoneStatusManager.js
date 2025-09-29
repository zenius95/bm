// utils/phoneStatusManager.js
const PhoneNumber = require('../models/PhoneNumber');
const settingsService = require('./settingsService'); // Thêm service

const CHECK_INTERVAL_MINUTES = 1; // Tần suất kiểm tra (mỗi 1 phút)

let intervalId = null;

const phoneStatusManager = {
    start() {
        console.log('[PhoneStatusManager] 🧹 Bắt đầu dịch vụ dọn dẹp SĐT bị kẹt...');
        this.cleanupStaleInUseNumbers(); 
        intervalId = setInterval(
            () => this.cleanupStaleInUseNumbers(), 
            CHECK_INTERVAL_MINUTES * 60 * 1000
        );
        console.log(`[PhoneStatusManager] ✅ Dịch vụ đang chạy, sẽ kiểm tra mỗi ${CHECK_INTERVAL_MINUTES} phút.`);
    },

    stop() {
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
            console.log('[PhoneStatusManager] 🛑 Đã dừng dịch vụ dọn dẹp.');
        }
    },

    async cleanupStaleInUseNumbers() {
        const STALE_TIMEOUT_MINUTES = settingsService.get('phoneManager').stalePhoneTimeoutMinutes || 10;
        console.log(`[PhoneStatusManager] 🔍 Đang tìm các SĐT ở trạng thái IN_USE quá ${STALE_TIMEOUT_MINUTES} phút...`);
        
        try {
            const cutoffTime = new Date(Date.now() - STALE_TIMEOUT_MINUTES * 60 * 1000);

            const result = await PhoneNumber.updateMany(
                {
                    status: 'IN_USE',
                    lastUsedAt: { $lt: cutoffTime }
                },
                {
                    $set: { status: 'AVAILABLE' },
                    $unset: { lastUsedAt: "" }
                }
            );

            if (result.modifiedCount > 0) {
                console.log(`[PhoneStatusManager] ✨ Đã dọn dẹp và giải cứu thành công ${result.modifiedCount} SĐT.`);
            } else {
                console.log('[PhoneStatusManager] 👍 Không tìm thấy SĐT nào bị kẹt.');
            }

        } catch (error) {
            console.error('[PhoneStatusManager] ❌ Lỗi trong quá trình dọn dẹp:', error);
        }
    }
};

module.exports = phoneStatusManager;