// controllers/settingController.js
const autoCheckManager = require('../utils/autoCheckManager');
const settingsService = require('../utils/settingsService');

const settingController = {}; // Tạo một object rỗng

// Render trang cài đặt
settingController.getSettingsPage = async (req, res) => {
    try {
        res.render('settings', {
            // Lấy tất cả setting để sau này dễ mở rộng
            settings: settingsService.getAll(),
            // Vẫn truyền initial state cho autoCheck để không phải sửa JS ở view
            initialState: JSON.stringify(autoCheckManager.getStatus()) 
        });
    } catch (error) {
        console.error("Error loading settings page:", error);
        res.status(500).send("Could not load settings page.");
    }
};

// Lấy trạng thái hiện tại của auto check
settingController.getAutoCheckStatus = (req, res) => {
    res.json(autoCheckManager.getStatus());
};

// Cập nhật cấu hình
settingController.updateAutoCheckConfig = async (req, res) => {
    try {
        const { isEnabled, intervalMinutes } = req.body;
        const configToUpdate = {};

        if (typeof isEnabled === 'boolean') {
            configToUpdate.isEnabled = isEnabled;
        }

        const interval = parseInt(intervalMinutes, 10);
        if (!isNaN(interval) && interval > 0) {
            configToUpdate.intervalMinutes = interval;
        }
        
        // Giao toàn bộ việc xử lý cho manager
        await autoCheckManager.updateConfig(configToUpdate);

        res.json({ success: true, message: 'Cập nhật cài đặt thành công.', data: autoCheckManager.getStatus() });
    } catch (error) {
        console.error("Error updating auto check config:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = settingController; // Export cả object sau khi đã định nghĩa xong tất cả các hàm