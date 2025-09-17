// controllers/settingController.js
const autoCheckManager = require('../utils/autoCheckManager');
const itemProcessorManager = require('../utils/itemProcessorManager');
const settingsService = require('../utils/settingsService');
const Worker = require('../models/Worker');
const { logActivity } = require('../utils/activityLogService');
const autoDepositManager = require('../utils/autoDepositManager');
const autoProxyCheckManager = require('../utils/autoProxyCheckManager'); // Import manager mới
const fs = require('fs').promises;
const path = require('path');

const settingController = {};

/**
 * Đọc tất cả các file JSON trong một thư mục và trích xuất thông tin cần thiết.
 * @param {string} dirPath - Đường dẫn đến thư mục chứa file config.
 * @returns {Promise<Array<{id: string, name: string}>>} - Mảng các object dịch vụ.
 */
async function getServicesFromDir(dirPath) {
    try {
        const files = await fs.readdir(dirPath);
        const servicePromises = files
            .filter(file => file.endsWith('.json'))
            .map(async (file) => {
                try {
                    const filePath = path.join(dirPath, file);
                    const content = await fs.readFile(filePath, 'utf-8');
                    const config = JSON.parse(content);
                    return {
                        id: file, // Tên file được dùng làm ID
                        name: config.name || file // Lấy tên từ config, nếu không có thì dùng tên file
                    };
                } catch (error) {
                    console.error(`Lỗi khi đọc file config dịch vụ ${file}:`, error);
                    return null;
                }
            });
        
        const services = await Promise.all(servicePromises);
        return services.filter(Boolean); // Lọc ra các kết quả null (nếu có lỗi)
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.warn(`Thư mục dịch vụ không tồn tại: ${dirPath}`);
        } else {
            console.error(`Không thể đọc thư mục dịch vụ ${dirPath}:`, error);
        }
        return []; // Trả về mảng rỗng nếu có lỗi
    }
}


async function logSettingsChange(req, section) {
    await logActivity(req.session.user.id, 'ADMIN_UPDATE_SETTINGS', {
        details: `Admin '${req.session.user.username}' đã cập nhật cài đặt: ${section}.`,
        ipAddress: req.ip || req.connection.remoteAddress,
        context: 'Admin'
    });
}

settingController.getSettingsPage = async (req, res) => {
    try {
        const captchaDir = path.join(__dirname, '..', 'insta', 'configs', 'captcha_services');
        const phoneDir = path.join(__dirname, '..', 'insta', 'configs', 'phone_services');
        
        const [allCaptchaServices, availablePhoneServices] = await Promise.all([
            getServicesFromDir(captchaDir),
            getServicesFromDir(phoneDir)
        ]);

        // Phân loại dịch vụ captcha
        const availableImageCaptchaServices = allCaptchaServices.filter(s => s.id.includes('_image'));
        const availableRecaptchaServices = allCaptchaServices.filter(s => !s.id.includes('_image'));

        res.render('admin/settings', {
            settings: settingsService.getAll(),
            initialState: { 
                autoCheck: autoCheckManager.getStatus(),
                autoProxyCheck: autoProxyCheckManager.getStatus(), 
                itemProcessor: itemProcessorManager.getStatus(),
                autoDeposit: autoDepositManager.getStatus() 
            },
            availableImageCaptchaServices,
            availableRecaptchaServices,
            availablePhoneServices,
            title: 'System Settings',
            page: 'settings'
        });
    } catch (error) {
        console.error("Error loading settings page:", error);
        res.status(500).send("Could not load settings page.");
    }
};

settingController.updateServicesConfig = async (req, res) => {
    try {
        const { 
            selectedImageCaptchaService, imageCaptchaApiKey,
            selectedRecaptchaService, recaptchaApiKey,
            selectedPhoneService, phoneApiKey 
        } = req.body;
        
        const currentServices = settingsService.get('services');

        const newApiKeys = {
            captcha: { ...currentServices.apiKeys.captcha },
            phone: { ...currentServices.apiKeys.phone }
        };

        if (selectedImageCaptchaService) {
            newApiKeys.captcha[selectedImageCaptchaService] = imageCaptchaApiKey;
        }
        if (selectedRecaptchaService) {
            newApiKeys.captcha[selectedRecaptchaService] = recaptchaApiKey;
        }

        if (selectedPhoneService) {
            newApiKeys.phone[selectedPhoneService] = phoneApiKey;
        }

        const newConfig = {
            selectedImageCaptchaService: selectedImageCaptchaService || currentServices.selectedImageCaptchaService,
            selectedRecaptchaService: selectedRecaptchaService || currentServices.selectedRecaptchaService,
            selectedPhoneService: selectedPhoneService || currentServices.selectedPhoneService,
            apiKeys: newApiKeys
        };

        await settingsService.update('services', newConfig);
        await logSettingsChange(req, "Cấu hình Dịch vụ bên thứ ba");
        res.json({ success: true, message: 'Cập nhật lựa chọn dịch vụ và API Key thành công.' });
    } catch (error) {
        console.error("Error updating services config:", error.message);
        res.status(500).json({ success: false, message: error.message });
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
        const { pricingTiers } = req.body;
        
        if (!Array.isArray(pricingTiers) || pricingTiers.length === 0) {
            return res.status(400).json({ success: false, message: 'Dữ liệu bậc giá không hợp lệ.' });
        }

        const cleanedTiers = pricingTiers.map(tier => ({
            quantity: parseInt(tier.quantity, 10),
            price: parseInt(tier.price, 10)
        })).filter(tier => !isNaN(tier.quantity) && tier.quantity > 0 && !isNaN(tier.price) && tier.price >= 0);

        if (cleanedTiers.length !== pricingTiers.length) {
            return res.status(400).json({ success: false, message: 'Một số bậc giá có giá trị không hợp lệ.' });
        }
        
        cleanedTiers.sort((a, b) => a.quantity - b.quantity);

        await settingsService.update('order', { pricingTiers: cleanedTiers });

        await logSettingsChange(req, "Cấu hình Đơn hàng");
        res.json({ success: true, message: 'Cập nhật cài đặt bậc giá thành công.' });
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

settingController.updateAutoProxyCheckConfig = async (req, res) => {
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
        
        await autoProxyCheckManager.updateConfig(configToUpdate);
        await logSettingsChange(req, "Cấu hình Tự động Check Proxy");
        res.json({ success: true, message: 'Cập nhật cài đặt Auto Proxy Check thành công.', data: autoProxyCheckManager.getStatus() });
    } catch (error) {
        console.error("Error updating auto proxy check config:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

settingController.updateItemProcessorConfig = async (req, res) => {
    try {
        const { concurrency, pollingInterval, maxSuccess, maxError } = req.body;
        const configToUpdate = {};
        const parse = (val, min = 0) => { const num = parseInt(val, 10); return !isNaN(num) && num >= min ? num : undefined; };
        configToUpdate.concurrency = parse(concurrency, 1);
        configToUpdate.pollingInterval = parse(pollingInterval, 1);
        configToUpdate.maxSuccess = parse(maxSuccess, 0);
        configToUpdate.maxError = parse(maxError, 0);

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