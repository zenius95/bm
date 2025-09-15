// controllers/settingController.js
const autoCheckManager = require('../utils/autoCheckManager');

// Render trang cài đặt
exports.getSettingsPage = async (req, res) => {
    try {
        const status = autoCheckManager.getStatus();
        res.render('settings', {
            initialState: JSON.stringify(status) // Truyền trạng thái ban đầu vào view
        });
    } catch (error) {
        console.error("Error loading settings page:", error);
        res.status(500).send("Could not load settings page.");
    }
};

// Lấy trạng thái hiện tại của auto check
exports.getAutoCheckStatus = (req, res) => {
    res.json(autoCheckManager.getStatus());
};

// Cập nhật cấu hình
exports.updateAutoCheckConfig = async (req, res) => {
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
        
        await autoCheckManager.updateConfig(configToUpdate);
        
        if (typeof isEnabled === 'boolean') {
            if (isEnabled) {
                autoCheckManager.start();
            } else {
                autoCheckManager.stop();
            }
        }

        res.json({ success: true, message: 'Cập nhật cài đặt thành công.', data: autoCheckManager.getStatus() });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};