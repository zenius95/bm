const autoCheckManager = require('../utils/autoCheckManager');
const itemProcessorManager = require('../utils/itemProcessorManager');
const settingsService = require('../utils/settingsService');
const Worker = require('../models/Worker');
const { logActivity } = require('../utils/activityLogService');
const autoDepositManager = require('../utils/autoDepositManager');
const autoProxyCheckManager = require('../utils/autoProxyCheckManager');
const autoPhoneManager = require('../utils/autoPhoneManager'); // Mới thêm
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
                autoDeposit: autoDepositManager.getStatus(),
                autoPhone: autoPhoneManager.getStatus() // Cập nhật
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
            selectedPhoneService, phoneApiKey,
            userAgents 
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

        const userAgentList = typeof userAgents === 'string' 
            ? userAgents.split('\n').map(ua => ua.trim()).filter(ua => ua)
            : [];

        const newConfig = {
            selectedImageCaptchaService: selectedImageCaptchaService || currentServices.selectedImageCaptchaService,
            selectedRecaptchaService: selectedRecaptchaService || currentServices.selectedRecaptchaService,
            selectedPhoneService: selectedPhoneService || currentServices.selectedPhoneService,
            apiKeys: newApiKeys,
            userAgents: userAgentList
        };

        await settingsService.update('services', newConfig);
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
        res.json({ success: true, message: 'Đã cập nhật Master API Key thành công.' });
    } catch (error) {
        console.error("Error updating master api key:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

settingController.updateOrderConfig = async (req, res) => {
    try {
        const { pricingTiers, maxItemsPerOrder } = req.body;
        
        // Kiểm tra pricingTiers là một object chứa BM và TKQC
        if (typeof pricingTiers !== 'object' || !pricingTiers.BM || !pricingTiers.TKQC) {
            return res.status(400).json({ success: false, message: 'Dữ liệu bậc giá không hợp lệ.' });
        }

        if (typeof maxItemsPerOrder !== 'object' || maxItemsPerOrder.BM === undefined || maxItemsPerOrder.TKQC === undefined) {
            return res.status(400).json({ success: false, message: 'Dữ liệu giới hạn đơn hàng không hợp lệ.' });
        }
        const maxItemsBM = parseInt(maxItemsPerOrder.BM, 10);
        const maxItemsTKQC = parseInt(maxItemsPerOrder.TKQC, 10);
        if (isNaN(maxItemsBM) || maxItemsBM < 0 || isNaN(maxItemsTKQC) || maxItemsTKQC < 0) {
            return res.status(400).json({ success: false, message: 'Số items tối đa không hợp lệ.' });
        }

        // Hàm helper để làm sạch và sắp xếp các bậc giá
        const cleanAndSortTiers = (tiers) => {
            if (!Array.isArray(tiers)) return [];
            const cleaned = tiers.map(tier => ({
                quantity: parseInt(tier.quantity, 10),
                price: parseInt(tier.price, 10)
            })).filter(tier => !isNaN(tier.quantity) && tier.quantity > 0 && !isNaN(tier.price) && tier.price >= 0);

            if (cleaned.length !== tiers.length) {
                throw new Error('Một số bậc giá có giá trị không hợp lệ.');
            }
            return cleaned.sort((a, b) => a.quantity - b.quantity);
        };

        const cleanedTiers = {
            BM: cleanAndSortTiers(pricingTiers.BM),
            TKQC: cleanAndSortTiers(pricingTiers.TKQC)
        };
        
        await settingsService.update('order', { 
            pricingTiers: cleanedTiers, 
            maxItemsPerOrder: { BM: maxItemsBM, TKQC: maxItemsTKQC } 
        });
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

        if (isEnabled !== undefined) {
            configToUpdate.isEnabled = typeof isEnabled === 'boolean' ? isEnabled : (isEnabled === 'true');
        }
        if (intervalMinutes !== undefined) {
            const parsed = parseInt(intervalMinutes, 10);
            if (!isNaN(parsed) && parsed >= 1) configToUpdate.intervalMinutes = parsed;
        }
        if (apiKey !== undefined) {
            configToUpdate.apiKey = apiKey;
        }
        if (prefix !== undefined) {
            configToUpdate.prefix = prefix;
        }
        
        await autoDepositManager.updateConfig(configToUpdate);
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

        if (isEnabled !== undefined) {
            configToUpdate.isEnabled = typeof isEnabled === 'boolean' ? isEnabled : (isEnabled === 'true');
        }

        const parseAndSet = (key, value, min) => {
            if (value !== undefined) {
                const parsed = parseInt(value, 10);
                if (!isNaN(parsed) && parsed >= min) {
                    configToUpdate[key] = parsed;
                }
            }
        };

        parseAndSet('intervalMinutes', intervalMinutes, 1);
        parseAndSet('concurrency', concurrency, 1);
        parseAndSet('delay', delay, 0);
        parseAndSet('timeout', timeout, 1000);
        parseAndSet('batchSize', batchSize, 0);
        
        await autoCheckManager.updateConfig(configToUpdate);
        res.json({ success: true, message: 'Cập nhật cài đặt Auto Check thành công.', data: autoCheckManager.getStatus() });
    } catch (error) {
        console.error("Error updating auto check config:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

settingController.updateAutoProxyCheckConfig = async (req, res) => {
    try {
        const { isEnabled, intervalMinutes, concurrency, delay, timeout, batchSize, retries } = req.body;
        const configToUpdate = {};

        if (isEnabled !== undefined) {
            configToUpdate.isEnabled = typeof isEnabled === 'boolean' ? isEnabled : (isEnabled === 'true');
        }

        const parseAndSet = (key, value, min) => {
            if (value !== undefined) {
                const parsed = parseInt(value, 10);
                if (!isNaN(parsed) && parsed >= min) {
                    configToUpdate[key] = parsed;
                }
            }
        };

        parseAndSet('intervalMinutes', intervalMinutes, 1);
        parseAndSet('concurrency', concurrency, 1);
        parseAndSet('delay', delay, 0);
        parseAndSet('timeout', timeout, 1000);
        parseAndSet('batchSize', batchSize, 0);
        parseAndSet('retries', retries, 0);
        
        await autoProxyCheckManager.updateConfig(configToUpdate);
        res.json({ success: true, message: 'Cập nhật cài đặt Auto Proxy Check thành công.', data: autoProxyCheckManager.getStatus() });
    } catch (error) {
        console.error("Error updating auto proxy check config:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

settingController.updateItemProcessorConfig = async (req, res) => {
    try {
        const { concurrency, pollingInterval, timeout, maxSuccess, maxError } = req.body;
        
        const configToUpdate = {};
        const parse = (val, min = 0) => { const num = parseInt(val, 10); return !isNaN(num) && num >= min ? num : undefined; };
        configToUpdate.concurrency = parse(concurrency, 1);
        configToUpdate.pollingInterval = parse(pollingInterval, 1);
        configToUpdate.timeout = parse(timeout, 1000); 
        configToUpdate.maxSuccess = parse(maxSuccess, 0);
        configToUpdate.maxError = parse(maxError, 0);

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

settingController.getAutoCheckStatus = (req, res) => {
    res.json(autoCheckManager.getStatus());
};

settingController.updateAutoPhoneConfig = async (req, res) => {
    try {
        const { isEnabled, intervalMinutes, countries, sources } = req.body;
        const configToUpdate = {};

        if (isEnabled !== undefined) {
            configToUpdate.isEnabled = typeof isEnabled === 'boolean' ? isEnabled : (isEnabled === 'true');
        }
        if (intervalMinutes !== undefined) {
            const parsedInterval = parseInt(intervalMinutes, 10);
            if (!isNaN(parsedInterval) && parsedInterval >= 1) {
                configToUpdate.intervalMinutes = parsedInterval;
            }
        }
        if (countries !== undefined) {
            configToUpdate.countries = Array.isArray(countries) ? countries.filter(Boolean) : [];
        }
        if (sources !== undefined) {
            configToUpdate.sources = Array.isArray(sources) ? sources.filter(Boolean) : [];
        }

        await autoPhoneManager.updateConfig(configToUpdate);
        res.json({ success: true, message: 'Cập nhật cài đặt Tự động lấy SĐT thành công.', data: autoPhoneManager.getStatus() });
    } catch (error) {
        console.error("Error updating auto phone config:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// START: THÊM MỚI
settingController.updateBrowserSettings = async (req, res) => {
    try {
        const { 
            maxBrowsers, 
            maxPagesPerBrowser, 
            respawnDelayMs, 
            stalePhoneTimeoutMinutes,
            proxies
        } = req.body;

        const parse = (val, min) => {
            const num = parseInt(val, 10);
            return !isNaN(num) && num >= min ? num : undefined;
        };

        const browserConfig = {
            maxBrowsers: parse(maxBrowsers, 1),
            maxPagesPerBrowser: parse(maxPagesPerBrowser, 1),
            respawnDelayMs: parse(respawnDelayMs, 1000),
            proxies: proxies.split('\n').map(p => p.trim()).filter(Boolean)
        };

        const phoneConfig = {
            stalePhoneTimeoutMinutes: parse(stalePhoneTimeoutMinutes, 1)
        };

        // Lọc bỏ các giá trị undefined để không ghi đè lên setting hiện tại nếu input trống
        Object.keys(browserConfig).forEach(key => browserConfig[key] === undefined && delete browserConfig[key]);
        Object.keys(phoneConfig).forEach(key => phoneConfig[key] === undefined && delete phoneConfig[key]);

        await settingsService.update('browserManager', browserConfig);
        await settingsService.update('phoneManager', phoneConfig);

        res.json({ success: true, message: 'Cập nhật cài đặt trình duyệt thành công.' });
    } catch (error) {
        console.error("Error updating browser settings:", error);
        res.status(500).json({ success: false, message: 'Lỗi server khi cập nhật cài đặt.' });
    }
};
// END: THÊM MỚI

module.exports = settingController;