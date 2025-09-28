// utils/phoneStatusManager.js
const PhoneNumber = require('../models/PhoneNumber');

const CHECK_INTERVAL_MINUTES = 1; // Tần suất kiểm tra (mỗi 1 phút)
const STALE_TIMEOUT_MINUTES = 10; // Coi là "kẹt" nếu quá 10 phút

let intervalId = null;

const phoneStatusManager = {
    /**
     * Bắt đầu dịch vụ dọn dẹp tự động.
     */
    start() {
        console.log('[PhoneStatusManager] 🧹 Bắt đầu dịch vụ dọn dẹp SĐT bị kẹt...');
        // Chạy ngay một lần khi khởi động
        this.cleanupStaleInUseNumbers(); 
        // Sau đó lặp lại theo chu kỳ
        intervalId = setInterval(
            () => this.cleanupStaleInUseNumbers(), 
            CHECK_INTERVAL_MINUTES * 60 * 1000
        );
        console.log(`[PhoneStatusManager] ✅ Dịch vụ đang chạy, sẽ kiểm tra mỗi ${CHECK_INTERVAL_MINUTES} phút.`);
    },

    /**
     * Dừng dịch vụ khi tắt server.
     */
    stop() {
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
            console.log('[PhoneStatusManager] 🛑 Đã dừng dịch vụ dọn dẹp.');
        }
    },

    /**
     * Logic chính: Tìm và giải cứu các SĐT bị kẹt.
     */
    async cleanupStaleInUseNumbers() {
        console.log('[PhoneStatusManager] 🔍 Đang tìm các SĐT ở trạng thái IN_USE quá lâu...');
        
        try {
            // Tính toán thời gian giới hạn (ví dụ: 10 phút trước)
            const cutoffTime = new Date(Date.now() - STALE_TIMEOUT_MINUTES * 60 * 1000);

            // Tìm tất cả các số có status = IN_USE và lastUsedAt < thời gian giới hạn
            const result = await PhoneNumber.updateMany(
                {
                    status: 'IN_USE',
                    lastUsedAt: { $lt: cutoffTime }
                },
                {
                    $set: { status: 'AVAILABLE' },
                    $unset: { lastUsedAt: "" } // Xóa trường lastUsedAt để cho sạch
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