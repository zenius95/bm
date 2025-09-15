const autoCheckManager = require('../utils/autoCheckManager');
const itemProcessorManager = require('../utils/itemProcessorManager');
const settingsService = require('../utils/settingsService');

const settingController = {};

settingController.getSettingsPage = async (req, res) => {
    try {
        res.render('settings', {
            settings: settingsService.getAll(),
            initialState: JSON.stringify({
                autoCheck: autoCheckManager.getStatus(),
                // Truyền trạng thái của itemProcessor vào view
                itemProcessor: itemProcessorManager.getStatus() 
            }) 
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

// Cập nhật để xử lý thêm các trường mới
settingController.updateAutoCheckConfig = async (req, res) => {
    try {
        const { isEnabled, intervalMinutes, concurrency, delay, timeout } = req.body;
        const configToUpdate = {};

        if (typeof isEnabled === 'boolean') {
            configToUpdate.isEnabled = isEnabled;
        }

        const parseAndValidate = (val, min = 0) => {
            const num = parseInt(val, 10);
            return !isNaN(num) && num >= min ? num : undefined;
        };

        configToUpdate.intervalMinutes = parseAndValidate(intervalMinutes, 1);
        configToUpdate.concurrency = parseAndValidate(concurrency, 1);
        configToUpdate.delay = parseAndValidate(delay, 0);
        configToUpdate.timeout = parseAndValidate(timeout, 1000);
        
        Object.keys(configToUpdate).forEach(key => configToUpdate[key] === undefined && delete configToUpdate[key]);
        
        await autoCheckManager.updateConfig(configToUpdate);

        res.json({ success: true, message: 'Cập nhật cài đặt thành công.', data: autoCheckManager.getStatus() });
    } catch (error) {
        console.error("Error updating auto check config:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Cập nhật cấu hình cho Item Processor
settingController.updateItemProcessorConfig = async (req, res) => {
    try {
        // Chỉ còn nhận concurrency và pollingInterval
        const { concurrency, pollingInterval } = req.body;
        const configToUpdate = {};

        const parseAndValidate = (val, min = 0) => {
            const num = parseInt(val, 10);
            return !isNaN(num) && num >= min ? num : undefined;
        };

        configToUpdate.concurrency = parseAndValidate(concurrency, 1);
        configToUpdate.pollingInterval = parseAndValidate(pollingInterval, 1);
        
        // Xóa các key không hợp lệ
        Object.keys(configToUpdate).forEach(key => configToUpdate[key] === undefined && delete configToUpdate[key]);
        
        // Chỉ update nếu có dữ liệu
        if (Object.keys(configToUpdate).length > 0) {
            await itemProcessorManager.updateConfig(configToUpdate);
        }

        res.json({ success: true, message: 'Cập nhật cài đặt thành công.', data: itemProcessorManager.getStatus() });
    } catch (error) {
        console.error("Error updating item processor config:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = settingController;