// utils/phoneStatusManager.js
const PhoneNumber = require('../models/PhoneNumber');

class PhoneStatusManager {
    constructor() {
        this.timer = null;
        this.timeoutMinutes = 10; // Timeout 10 phút
    }

    initialize() {
        console.log('🔄 Initializing Phone Status Manager (Timeout Service)...');
        this.start();
    }

    start() {
        if (this.timer) clearInterval(this.timer);
        // Chạy mỗi phút một lần
        this.timer = setInterval(() => this.releaseExpiredPhones(), 60 * 1000);
        console.log(`[PhoneStatusManager] Service started. Releasing IN_USE phones after ${this.timeoutMinutes} minutes.`);
    }

    stop() {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        console.log('[PhoneStatusManager] Service stopped.');
    }

    async releaseExpiredPhones() {
        const timeout = new Date(Date.now() - this.timeoutMinutes * 60 * 1000);
        try {
            const result = await PhoneNumber.updateMany(
                {
                    status: 'IN_USE',
                    lastUsedAt: { $lt: timeout }
                },
                {
                    $set: {
                        status: 'AVAILABLE',
                        lastUsedAt: null
                    }
                }
            );

            if (result.modifiedCount > 0) {
                console.log(`[PhoneStatusManager] Released ${result.modifiedCount} expired phone numbers.`);
            }
        } catch (error) {
            console.error('[PhoneStatusManager] Error releasing expired phones:', error);
        }
    }
}

module.exports = new PhoneStatusManager();