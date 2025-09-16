// controllers/settingController.js
const autoCheckManager = require('../utils/autoCheckManager');
const itemProcessorManager = require('../utils/itemProcessorManager');
const settingsService = require('../utils/settingsService');
const Worker = require('../models/Worker');
const { logActivity } = require('../utils/activityLogService');
const autoDepositManager = require('../utils/autoDepositManager');

const settingController = {};

async function logSettingsChange(req, section) {
    await logActivity(req.session.user.id, 'ADMIN_UPDATE_SETTINGS', {
        details: `Admin '${req.session.user.username}' đã cập nhật cài đặt: ${section}.`,
        ipAddress: req.ip || req.connection.remoteAddress,
        context: 'Admin'
    });
}

settingController.getSettingsPage = async (req, res) => {
    try {
        res.render('admin/settings', {
            settings: settingsService.getAll(),
            // === START: SỬA LỖI LOGIC ===
            // Truyền thẳng object, không chuyển thành chuỗi JSON
            initialState: { 
                autoCheck: autoCheckManager.getStatus(),
                itemProcessor: itemProcessorManager.getStatus(),
                autoDeposit: autoDepositManager.getStatus() 
            },
            // === END: SỬA LỖI LOGIC ===
            title: 'System Settings',
            page: 'settings'
        });
    } catch (error) {
        console.error("Error loading settings page:", error);
        res.status(500).send("Could not load settings page.");
    }
};

settingController.updateMasterApiKey = async (req, res) => {
    try {
        const { masterApiKey } = req.body;
        if (!masterApiKey || masterApiKey.length < 32) {
            return res.status(400).json({ success: false, message: 'API Key không hợp lệ.' });
        }
        await settingsService.update('masterApiKey', masterApiKey);
        await Worker.updateOne({ isLocal: true }, { $set: { apiKey: masterApiKey } });
        await logSettingsChange(req, "Master API Key");
        res.json({ success: true, message: 'Đã cập nhật Master API Key thành công.' });
    } catch (error) {
        console.error("Error updating master api key:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

settingController.updateOrderConfig = async (req, res) => {
    try {
        const { pricePerItem } = req.body;
        const price = parseInt(pricePerItem, 10);
        if (isNaN(price) || price < 0) {
            return res.status(400).json({ success: false, message: 'Giá tiền không hợp lệ.' });
        }
        await settingsService.update('order', { pricePerItem: price });
        await logSettingsChange(req, "Cấu hình Đơn hàng");
        res.json({ success: true, message: 'Cập nhật cài đặt đơn hàng thành công.' });
    } catch (error) {
        console.error("Error updating order config:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

settingController.updateDepositConfig = async (req, res) => {
    try {
        const { bankName, accountName, accountNumber } = req.body;
        if (!bankName || !accountName || !accountNumber) {
            return res.status(400).json({ success: false, message: 'Vui lòng điền đầy đủ thông tin.' });
        }
        const config = { bankName, accountName, accountNumber };
        await settingsService.update('deposit', config);
        await logSettingsChange(req, "Cấu hình Nạp tiền");
        res.json({ success: true, message: 'Cập nhật thông tin nạp tiền thành công.' });
    } catch (error) {
        console.error("Error updating deposit config:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

settingController.updateAutoDepositConfig = async (req, res) => {
    try {
        const { isEnabled, intervalMinutes, apiKey, prefix } = req.body;
        const configToUpdate = {};
        if (typeof isEnabled === 'boolean') configToUpdate.isEnabled = isEnabled;
        const parse = (val, min = 0) => { const num = parseInt(val, 10); return !isNaN(num) && num >= min ? num : undefined; };
        configToUpdate.intervalMinutes = parse(intervalMinutes, 1);
        if(apiKey !== undefined) configToUpdate.apiKey = apiKey;
        if(prefix !== undefined) configToUpdate.prefix = prefix;

        Object.keys(configToUpdate).forEach(key => configToUpdate[key] === undefined && delete configToUpdate[key]);
        
        await autoDepositManager.updateConfig(configToUpdate);
        await logSettingsChange(req, "Cấu hình Tự động Nạp tiền");
        res.json({ success: true, message: 'Cập nhật cài đặt Tự động Nạp tiền thành công.', data: autoDepositManager.getStatus() });
    } catch (error) {
        console.error("Error updating auto deposit config:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

settingController.updateAutoCheckConfig = async (req, res) => {
    try {
        const { isEnabled, intervalMinutes, concurrency, delay, timeout, batchSize } = req.body;
        const configToUpdate = {};
        if (typeof isEnabled === 'boolean') configToUpdate.isEnabled = isEnabled;
        const parse = (val, min = 0) => { const num = parseInt(val, 10); return !isNaN(num) && num >= min ? num : undefined; };
        configToUpdate.intervalMinutes = parse(intervalMinutes, 1);
        configToUpdate.concurrency = parse(concurrency, 1);
        configToUpdate.delay = parse(delay, 0);
        configToUpdate.timeout = parse(timeout, 1000);
        configToUpdate.batchSize = parse(batchSize, 0);
        Object.keys(configToUpdate).forEach(key => configToUpdate[key] === undefined && delete configToUpdate[key]);
        
        await autoCheckManager.updateConfig(configToUpdate);
        await logSettingsChange(req, "Cấu hình Tự động Check Live");
        res.json({ success: true, message: 'Cập nhật cài đặt Auto Check thành công.', data: autoCheckManager.getStatus() });
    } catch (error) {
        console.error("Error updating auto check config:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

settingController.updateItemProcessorConfig = async (req, res) => {
    try {
        const { concurrency, pollingInterval } = req.body;
        const configToUpdate = {};
        const parse = (val, min = 0) => { const num = parseInt(val, 10); return !isNaN(num) && num >= min ? num : undefined; };
        configToUpdate.concurrency = parse(concurrency, 1);
        configToUpdate.pollingInterval = parse(pollingInterval, 1);
        Object.keys(configToUpdate).forEach(key => configToUpdate[key] === undefined && delete configToUpdate[key]);
        
        if (Object.keys(configToUpdate).length > 0) {
            await itemProcessorManager.updateConfig(configToUpdate);
        }
        await logSettingsChange(req, "Cấu hình Tiến trình xử lý");
        res.json({ success: true, message: 'Cập nhật cài đặt Item Processor thành công.', data: itemProcessorManager.getStatus() });
    } catch (error) {
        console.error("Error updating item processor config:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

settingController.getAutoCheckStatus = (req, res) => {
    res.json(autoCheckManager.getStatus());
};

module.exports = settingController;