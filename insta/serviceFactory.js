// utils/serviceFactory.js
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const config = require('../config');

/**
 * Lớp cơ sở chứa các hàm tiện ích chung.
 */
class ExternalService {
    constructor(config) {
        if (!config) throw new Error("Cấu hình dịch vụ không được để trống.");
        this.config = config;
    }

    log(message) {
        console.log(`[${this.config.name || 'Service'}] ${message}`);
    }

    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    _getValueFromPath(obj, path) {
        if (!path || !obj) return null;
        return path.split('.').reduce((acc, part) => acc && acc[part], obj);
    }

    _formatTemplate(template, replacements) {
        let formatted = template;
        for (const key in replacements) {
            const regex = new RegExp(`{${key}}`, 'g');
            formatted = formatted.replace(regex, replacements[key]);
        }
        return formatted;
    }

    _formatBody(bodyTemplate, replacements) {
        let bodyString = JSON.stringify(bodyTemplate);
        for (const key in replacements) {
            const regex = new RegExp(`"{${key}}"`, 'g');
            bodyString = bodyString.replace(regex, JSON.stringify(replacements[key]));
        }
        return JSON.parse(bodyString);
    }

    async _makeRequest(url, options = {}) {
        const response = await fetch(url, options);
        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Không thể đọc nội dung lỗi.');
            throw new Error(`API trả về lỗi: ${response.status} - ${errorText}`);
        }
        return response.json();
    }
}

/**
 * Lớp xử lý logic cho các dịch vụ thuê số điện thoại.
 */
class PhoneService extends ExternalService {
    constructor(config) {
        super(config);
        // === START: LOGIC TỰ ĐỘNG NHẬN DIỆN VÀ CẤU HÌNH baseUrl ===
        const configString = JSON.stringify(this.config);
        if (configString.includes('{baseUrl}')) {
            const port = process.env.PORT || require('../config').server.port;
            const domain = process.env.API_DOMAIN || `http://localhost:${port}`;
            this.config.baseUrl = `${domain}/api/phone`;
            this.log(`Phát hiện placeholder {baseUrl}. Đã tự động cấu hình thành: ${this.config.baseUrl}`);
        }
        // === END: LOGIC TỰ ĐỘNG ===
    }

    _buildUrl(pathTemplate, replacements) {
        const { baseUrl } = this.config;
        // Thêm baseUrl vào danh sách các biến để thay thế
        const allReplacements = { ...replacements, baseUrl };
        return this._formatTemplate(pathTemplate, allReplacements);
    }

    async getPhoneNumber() {
        const { getPhone: phoneConfig, apiKey, service, delay } = this.config;
        const url = this._buildUrl(phoneConfig.url, { apiKey, service });

        for (let i = 1; i <= phoneConfig.retry; i++) {
            this.log(`Đang lấy SĐT (Lần thử ${i}/${phoneConfig.retry})...`);
            try {
                const data = await this._makeRequest(url);
                let phoneNumber = this._getValueFromPath(data, phoneConfig.phonePath);
                const id = this._getValueFromPath(data, phoneConfig.idPath);
                if (phoneNumber && id) {
                    this.log(`Lấy SĐT thành công: ${phoneNumber} (ID: ${id})`);
                    return { phone: phoneNumber, id };
                }
                this.log(`Không tìm thấy SĐT/ID. Chờ ${delay}ms...`);
            } catch (error) {
                this.log(`Lỗi khi lấy SĐT (Lần ${i}): ${error.message}. Chờ ${delay}ms...`);
            }
            await this._delay(delay);
        }
        throw new Error(`Không thể lấy SĐT sau ${phoneConfig.retry} lần thử.`);
    }

    async getCode(id) {
        const { getCode: codeConfig, apiKey, delay } = this.config;
        const url = this._buildUrl(codeConfig.url, { apiKey, id });
        
        for (let i = 1; i <= codeConfig.retry; i++) {
            this.log(`Đang lấy Code cho ID: ${id} (Lần thử ${i}/${codeConfig.retry})...`);
            try {
                const data = await this._makeRequest(url);
                const code = this._getValueFromPath(data, codeConfig.codePath);
                if (code) {
                    this.log(`Lấy Code thành công: ${code}`);
                    return code;
                }
                this.log(`Chưa có Code. Chờ ${delay}ms...`);
            } catch (error) {
                this.log(`Lỗi khi lấy Code (Lần ${i}): ${error.message}. Chờ ${delay}ms...`);
            }
            await this._delay(delay);
        }
        throw new Error(`Không thể lấy Code cho ID ${id} sau ${codeConfig.retry} lần thử.`);
    }

    async cancelPhoneNumber(id) {
        const { cancelPhone: cancelConfig, apiKey } = this.config;
        if (!cancelConfig) {
            this.log("Chức năng hủy số không được cấu hình cho dịch vụ này.");
            return;
        }

        const url = this._buildUrl(cancelConfig.url, { apiKey, id });
        this.log(`Đang gửi yêu cầu hủy cho SĐT có ID: ${id}...`);
        try {
            await this._makeRequest(url, { method: 'GET' });
            this.log(`Đã hủy thành công yêu cầu cho ID: ${id}`);
        } catch (error) {
            this.log(`⚠️ Lỗi khi hủy yêu cầu cho ID ${id}: ${error.message}`);
        }
    }

    async execute() {
        const { phone, id } = await this.getPhoneNumber();
        const code = await this.getCode(id);
        return { phone, id, code };
    }
}

// (Các lớp BaseCaptchaService, ImageCaptchaService, RecaptchaService giữ nguyên không đổi)
class BaseCaptchaService extends ExternalService {
    async _getResult(taskId) {
        const { getResult: resultConfig, apiKey, delay } = this.config;
        for (let i = 1; i <= resultConfig.retry; i++) {
            this.log(`Đang lấy kết quả cho Task ID: ${taskId} (Lần thử ${i}/${resultConfig.retry})...`);
            try {
                const url = this._formatTemplate(resultConfig.url, { apiKey, taskId });
                const body = this._formatBody(resultConfig.body, { apiKey, taskId });
                const data = await this._makeRequest(url, {
                     method: resultConfig.method || 'POST',
                     headers: resultConfig.headers,
                     body: JSON.stringify(body)
                });
                const status = this._getValueFromPath(data, resultConfig.statusPath);
                if (status === resultConfig.successStatus) {
                    const result = this._getValueFromPath(data, resultConfig.resultPath);
                    if (result) {
                        this.log(`Giải captcha thành công: ${result}`);
                        return result;
                    }
                }
                this.log(`Trạng thái: ${status}. Chờ ${delay}ms...`);
            } catch (error) {
                this.log(`Lỗi khi lấy kết quả (Lần ${i}): ${error.message}.`);
            }
            await this._delay(delay);
        }
        throw new Error(`Không thể giải captcha cho Task ID ${taskId} sau ${resultConfig.retry} lần thử.`);
    }
}
class ImageCaptchaService extends BaseCaptchaService {
    async solve(imageBase64) {
        const { createImageTask: taskConfig, apiKey } = this.config;
        const url = this._formatTemplate(taskConfig.url, { apiKey });
        const body = this._formatBody(taskConfig.body, { apiKey, imageBase64 });

        this.log("Đang tạo tác vụ giải CAPTCHA ẢNH...");
        const data = await this._makeRequest(url, {
            method: taskConfig.method || 'POST',
            headers: taskConfig.headers,
            body: JSON.stringify(body),
        });

        const taskId = this._getValueFromPath(data, taskConfig.taskIdPath);
        if (!taskId) throw new Error("Không thể lấy taskId từ phản hồi API.");
        
        this.log(`Tạo tác vụ thành công. Task ID: ${taskId}`);
        return await this._getResult(taskId);
    }
}
class RecaptchaService extends BaseCaptchaService {
    async solve(websiteUrl, websiteKey) {
        const { createRecaptchaTask: taskConfig, apiKey } = this.config;
        const url = this._formatTemplate(taskConfig.url, { apiKey });
        const body = this._formatBody(taskConfig.body, { apiKey, websiteUrl, websiteKey });
        
        this.log("Đang tạo tác vụ giải RECAPTCHA...");
        const data = await this._makeRequest(url, {
            method: taskConfig.method || 'POST',
            headers: taskConfig.headers,
            body: JSON.stringify(body),
        });

        const taskId = this._getValueFromPath(data, taskConfig.taskIdPath);
        if (!taskId) throw new Error("Không thể lấy taskId từ phản hồi API.");

        this.log(`Tạo tác vụ thành công. Task ID: ${taskId}`);
        return await this._getResult(taskId);
    }
}


/**
 * Factory để tạo ra các đối tượng dịch vụ dựa trên cấu hình.
 */
async function createService(serviceId, serviceType, options = {}, configDir = null) {
    const baseDir = configDir || path.resolve(__dirname, '../configs');
    const serviceDir = serviceType === 'phone' ? 'phone_services' : 'captcha_services';
    const configPath = path.join(baseDir, serviceDir, serviceId);

    if (!fs.existsSync(configPath)) {
        throw new Error(`Không tìm thấy file cấu hình tại: ${configPath}`);
    }

    const fileContent = await fs.promises.readFile(configPath, 'utf-8');
    const configData = JSON.parse(fileContent);

    const finalConfig = { ...configData, ...options };

    // Dựa vào cấu trúc của config để quyết định class sẽ tạo
    if (finalConfig.getPhone) {
        return new PhoneService(finalConfig);
    }
    if (finalConfig.createImageTask) {
        return new ImageCaptchaService(finalConfig);
    }
    if (finalConfig.createRecaptchaTask) {
        return new RecaptchaService(finalConfig);
    }
    
    throw new Error("Cấu hình không hợp lệ. Không thể xác định loại dịch vụ (phone, image captcha, recaptcha).");
}

module.exports = { createService };