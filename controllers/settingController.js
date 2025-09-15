// controllers/settingController.js
const autoCheckManager = require('../utils/autoCheckManager');
const itemProcessorManager = require('../utils/itemProcessorManager');
const settingsService = require('../utils/settingsService');
const Worker = require('../models/Worker'); // Thêm dòng này

const settingController = {};

settingController.getSettingsPage = async (req, res) => {
    try {
        res.render('settings', {
            settings: settingsService.getAll(),
            initialState: JSON.stringify({
                autoCheck: autoCheckManager.getStatus(),
                itemProcessor: itemProcessorManager.getStatus() 
            }) 
        });
    } catch (error) {
        console.error("Error loading settings page:", error);
        res.status(500).send("Could not load settings page.");
    }
};

// === START: THÊM HÀM MỚI ĐỂ CẬP NHẬT API KEY ===
settingController.updateMasterApiKey = async (req, res) => {
    try {
        const { masterApiKey } = req.body;
        if (!masterApiKey || masterApiKey.length < 32) {
            return res.status(400).json({ success: false, message: 'API Key không hợp lệ.' });
        }
        
        await settingsService.update('masterApiKey', masterApiKey);

        // Đồng bộ key mới cho worker local
        await Worker.updateOne(
            { isLocal: true },
            { $set: { apiKey: masterApiKey } }
        );

        res.json({ success: true, message: 'Đã cập nhật Master API Key thành công.' });
    } catch (error) {
        console.error("Error updating master api key:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};
// === END: THÊM HÀM MỚI ĐỂ CẬP NHẬT API KEY ===


settingController.getAutoCheckStatus = (req, res) => {
    res.json(autoCheckManager.getStatus());
};

settingController.updateAutoCheckConfig = async (req, res) => {
    try {
        const { isEnabled, intervalMinutes, concurrency, delay, timeout, batchSize } = req.body;
        const configToUpdate = {};

        if (typeof isEnabled === 'boolean') configToUpdate.isEnabled = isEnabled;
        
        const parse = (val, min = 0) => {
            const num = parseInt(val, 10);
            return !isNaN(num) && num >= min ? num : undefined;
        };

        configToUpdate.intervalMinutes = parse(intervalMinutes, 1);
        configToUpdate.concurrency = parse(concurrency, 1);
        configToUpdate.delay = parse(delay, 0);
        configToUpdate.timeout = parse(timeout, 1000);
        configToUpdate.batchSize = parse(batchSize, 0);
        
        Object.keys(configToUpdate).forEach(key => configToUpdate[key] === undefined && delete configToUpdate[key]);
        
        await autoCheckManager.updateConfig(configToUpdate);
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
        const parse = (val, min = 0) => {
            const num = parseInt(val, 10);
            return !isNaN(num) && num >= min ? num : undefined;
        };
        configToUpdate.concurrency = parse(concurrency, 1);
        configToUpdate.pollingInterval = parse(pollingInterval, 1);
        
        Object.keys(configToUpdate).forEach(key => configToUpdate[key] === undefined && delete configToUpdate[key]);
        
        if (Object.keys(configToUpdate).length > 0) {
            await itemProcessorManager.updateConfig(configToUpdate);
        }
        res.json({ success: true, message: 'Cập nhật cài đặt Item Processor thành công.', data: itemProcessorManager.getStatus() });
    } catch (error) {
        console.error("Error updating item processor config:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = settingController;