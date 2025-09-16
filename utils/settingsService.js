// utils/settingsService.js
const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');
const crypto = require('crypto'); // Thêm module crypto của Node.js

const SETTINGS_FILE_PATH = path.join(__dirname, '..', 'settings.json');

const DEFAULT_SETTINGS = {
    masterApiKey: '',
    order: {
        pricePerItem: 100 // Giá mặc định là 100
    },
    // === START: THÊM CÀI ĐẶT NẠP TIỀN ===
    deposit: {
        bankName: "TCB",
        accountName: "NGUYEN VAN A",
        accountNumber: "19036903216011"
    },
    // === END: THÊM CÀI ĐẶT NẠP TIỀN ===
    autoCheck: {
        isEnabled: false,
        intervalMinutes: 30,
        concurrency: 10,
        delay: 500,
        timeout: 45000,
        batchSize: 50
    },
    itemProcessor: {
        isEnabled: false,
        concurrency: 10,
        pollingInterval: 5
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
            this._data = {
                ...DEFAULT_SETTINGS,
                ...fileData,
                order: { ...DEFAULT_SETTINGS.order, ...(fileData.order || {}) },
                // === START: MERGE CÀI ĐẶT NẠP TIỀN ===
                deposit: { ...DEFAULT_SETTINGS.deposit, ...(fileData.deposit || {}) },
                // === END: MERGE CÀI ĐẶT NẠP TIỀN ===
                autoCheck: { ...DEFAULT_SETTINGS.autoCheck, ...(fileData.autoCheck || {}) },
                itemProcessor: { ...DEFAULT_SETTINGS.itemProcessor, ...(fileData.itemProcessor || {}) }
            };
            console.log('[SettingsService] Loaded config from settings.json');

            if (!this._data.masterApiKey) {
                console.log('[SettingsService] Master API Key not found. Generating a new one...');
                this._data.masterApiKey = crypto.randomBytes(32).toString('hex');
                await this._save();
            }

        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('[SettingsService] settings.json not found. Creating with default values.');
                this._data = DEFAULT_SETTINGS;
                this._data.masterApiKey = crypto.randomBytes(32).toString('hex'); // Tạo key cho file mới
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
            this.emit('updated', this._data);
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
    
    async update(key, value) {
        if (this._data[key] && typeof this._data[key] === 'object' && !Array.isArray(value) && value !== null) {
            this._data[key] = { ...this._data[key], ...value };
        } else {
            this._data[key] = value;
        }
        await this._save();
    }
}

module.exports = new SettingsService();