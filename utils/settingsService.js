// utils/settingsService.js
const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');
const crypto = require('crypto');

const SETTINGS_FILE_PATH = path.join(__dirname, '..', 'settings.json');

const DEFAULT_SETTINGS = {
    masterApiKey: '',
    order: {
        pricingTiers: [
            { quantity: 50, price: 10000 },
            { quantity: 20, price: 13000 },
            { quantity: 1, price: 15000 }
        ],
        maxItemsPerOrder: 0 // <<< THÊM DÒNG NÀY
    },
    deposit: {
        bankName: "TCB",
        accountName: "NGUYEN VAN A",
        accountNumber: "19036903216011"
    },
    autoDeposit: {
        isEnabled: false,
        intervalMinutes: 1,
        apiKey: '',
        prefix: 'NAPTIEN'
    },
    autoCheck: {
        isEnabled: false,
        intervalMinutes: 30,
        concurrency: 10,
        delay: 500,
        timeout: 45000,
        batchSize: 50
    },
    autoProxyCheck: {
        isEnabled: false,
        intervalMinutes: 60,
        concurrency: 10,
        delay: 500,
        timeout: 20000,
        batchSize: 100,
        retries: 2
    },
    itemProcessor: {
        isEnabled: false,
        concurrency: 10,
        pollingInterval: 5,
        timeout: 180000,
        maxSuccess: 4,
        maxError: 5
    },
    services: {
        selectedImageCaptchaService: 'omocaptcha_image.json',
        selectedRecaptchaService: '',
        selectedPhoneService: '',
        apiKeys: {
            captcha: {},
            phone: {}
        },
        userAgents: [
            "Instagram 361.0.0.46.88 Android (29/10; 560dpi; 1440x2792; samsung; SM-G960N; starlteks; samsungexynos9810; en_US; 674675098)"
        ]
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
                deposit: { ...DEFAULT_SETTINGS.deposit, ...(fileData.deposit || {}) },
                autoDeposit: { ...DEFAULT_SETTINGS.autoDeposit, ...(fileData.autoDeposit || {}) },
                autoCheck: { ...DEFAULT_SETTINGS.autoCheck, ...(fileData.autoCheck || {}) },
                autoProxyCheck: { ...DEFAULT_SETTINGS.autoProxyCheck, ...(fileData.autoProxyCheck || {}) },
                itemProcessor: { ...DEFAULT_SETTINGS.itemProcessor, ...(fileData.itemProcessor || {}) },
                services: {
                    ...DEFAULT_SETTINGS.services,
                    ...(fileData.services || {}),
                    apiKeys: {
                        ...DEFAULT_SETTINGS.services.apiKeys,
                        ...(fileData.services?.apiKeys || {})
                    },
                    userAgents: fileData.services?.userAgents || DEFAULT_SETTINGS.services.userAgents
                }
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
                this._data.masterApiKey = crypto.randomBytes(32).toString('hex');
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

    getSortedTiers() {
        const tiers = this.get('order', {}).pricingTiers || [];
        return [...tiers].sort((a, b) => b.quantity - a.quantity);
    }

    calculatePricePerItem(itemCount) {
        const sortedTiers = this.getSortedTiers();

        if (sortedTiers.length === 0) {
            return 0;
        }

        const applicableTier = sortedTiers.find(tier => itemCount >= tier.quantity);

        if (applicableTier) {
            return applicableTier.price;
        }

        return sortedTiers[sortedTiers.length - 1]?.price || 0;
    }
}

module.exports = new SettingsService();