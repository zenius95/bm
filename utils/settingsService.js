// utils/settingsService.js
const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');

const SETTINGS_FILE_PATH = path.join(__dirname, '..', 'settings.json');

// Cấu trúc mặc định cho settings, dễ dàng thêm mục mới ở đây
const DEFAULT_SETTINGS = {
    autoCheck: {
        isEnabled: false,
        intervalMinutes: 30,
        // === START: THAY ĐỔI QUAN TRỌNG ===
        concurrency: 10, // Số luồng
        delay: 500,      // Delay giữa các task (ms)
        timeout: 45000   // Timeout cho mỗi task (ms)
        // === END: THAY ĐỔI QUAN TRỌNG ===
    }
};

class SettingsService extends EventEmitter {
    constructor() {
        super();
        this._data = {};
    }

    async initialize() {
        try {
            const fileContent = await fs.readFile(SETTINGS_FILE_PATH, 'utf-8');
            const fileData = JSON.parse(fileContent);
            // Gộp setting mặc định và setting đã lưu để đảm bảo không thiếu key mới
            this._data = {
                ...DEFAULT_SETTINGS,
                ...fileData,
                autoCheck: {
                    ...DEFAULT_SETTINGS.autoCheck,
                    ...(fileData.autoCheck || {})
                }
            };
            console.log('[SettingsService] Loaded config from settings.json');
            // Ghi lại file nếu có thêm key mới từ default
            await this._save();
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('[SettingsService] settings.json not found. Creating with default values.');
                this._data = DEFAULT_SETTINGS;
                await this._save();
            } else {
                console.error('[SettingsService] Error reading settings.json:', error);
                this._data = DEFAULT_SETTINGS;
            }
        }
    }

    async _save() {
        try {
            await fs.writeFile(SETTINGS_FILE_PATH, JSON.stringify(this._data, null, 4));
            this.emit('updated', this._data); // Thông báo cho các module khác khi có thay đổi
        } catch (error) {
            console.error('[SettingsService] Failed to save settings.json:', error);
        }
    }

    get(key, defaultValue = undefined) {
        if (this._data.hasOwnProperty(key)) {
            return this._data[key];
        }
        return defaultValue;
    }
    
    getAll() {
        return this._data;
    }
    
    async update(key, partialValue) {
        if (this._data[key] && typeof this._data[key] === 'object') {
            this._data[key] = { ...this._data[key], ...partialValue };
        } else {
            this._data[key] = partialValue;
        }
        await this._save();
    }
}

// Export một instance duy nhất (singleton)
module.exports = new SettingsService();