// controllers/phoneApiController.js
const PhoneNumber = require('../models/PhoneNumber');
const settingsService = require('../utils/settingsService');
const { getCodeFromPhonePage } = require('../utils/phoneScraper'); // Import hàm scraper mới

const authenticateRequest = (req) => {
    const apiKey = req.query.apiKey;
    const masterApiKey = settingsService.get('masterApiKey');
    if (!apiKey) return { success: false, message: 'Unauthorized: API Key is missing.' };
    if (apiKey !== masterApiKey) return { success: false, message: 'Unauthorized: Invalid API Key.' };
    return { success: true };
};

const phoneApiController = {};

phoneApiController.getPhoneNumber = async (req, res) => {
    const authResult = authenticateRequest(req);
    if (!authResult.success) return res.status(401).json(authResult);

    try {
        const { country, source } = req.query;
        const matchQuery = { status: 'AVAILABLE', isDeleted: false };
        if (country) matchQuery.country = country;
        if (source) matchQuery.source = source;

        const count = await PhoneNumber.countDocuments(matchQuery);
        if (count === 0) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy số điện thoại nào khả dụng với tiêu chí đã chọn.' });
        }

        const rand = Math.floor(Math.random() * count);
        const randomPhone = await PhoneNumber.findOne(matchQuery).skip(rand).lean();

        if (!randomPhone) {
            console.warn('[PhoneAPI] Could not find random phone, retrying...');
            return phoneApiController.getPhoneNumber(req, res);
        }

        const phone = await PhoneNumber.findOneAndUpdate(
            { _id: randomPhone._id, status: 'AVAILABLE' },
            { $set: { status: 'IN_USE', lastUsedAt: new Date() } },
            { new: true }
        ).lean();

        if (!phone) {
            console.warn('[PhoneAPI] Race condition detected, retrying...');
            return phoneApiController.getPhoneNumber(req, res);
        }

        res.json({ success: true, phone });
    } catch (error) {
        console.error('[PhoneAPI] Error getting phone number:', error);
        res.status(500).json({ success: false, message: 'Lỗi server khi lấy số điện thoại.' });
    }
};

phoneApiController.getCode = async (req, res) => {
    const authResult = authenticateRequest(req);
    if (!authResult.success) {
        return res.status(401).json(authResult);
    }
    
    const { phoneNumberId } = req.query;
    if (!phoneNumberId) {
        return res.status(400).json({ success: false, message: 'Thiếu thông tin phoneNumberId.' });
    }

    try {
        const phoneRecord = await PhoneNumber.findById(phoneNumberId).lean();
        if (!phoneRecord) {
            return res.status(404).json({ success: false, message: `ID số điện thoại ${phoneNumberId} không được tìm thấy trong hệ thống.` });
        }

        const { phoneNumber, country } = phoneRecord;

        // Thay thế fetch bằng hàm puppeteer mới
        const code = await getCodeFromPhonePage(country, phoneNumber);

        if (code) {
            return res.json({ success: true, code: code, fullMessage: `Instagram code: ${code}` });
        }
        
        return res.status(404).json({ success: false, message: 'Không tìm thấy code Instagram trong các tin nhắn gần đây.' });

    } catch (error) {
        console.error('[PhoneAPI] Error getting code:', error);
        res.status(500).json({ success: false, message: 'Lỗi server khi lấy code.', error: error.message });
    }
};

phoneApiController.cancelPhoneNumber = async (req, res) => {
    const authResult = authenticateRequest(req);
    if (!authResult.success) return res.status(401).json(authResult);

    const { phoneNumberId } = req.query;
    if (!phoneNumberId) return res.status(400).json({ success: false, message: 'Vui lòng cung cấp ID của số điện thoại (phoneNumberId).' });

    try {
        const phone = await PhoneNumber.findOneAndUpdate(
            { _id: phoneNumberId, status: 'IN_USE' },
            { $set: { status: 'AVAILABLE', lastUsedAt: null } },
            { new: true }
        );
        if (!phone) return res.status(404).json({ success: false, message: 'Không tìm thấy số điện thoại đang sử dụng với ID này.' });
        res.json({ success: true, message: `Đã hủy và trả số ${phone.phoneNumber} về trạng thái AVAILABLE.` });
    } catch (error) {
        console.error('[PhoneAPI] Error canceling phone number:', error);
        res.status(500).json({ success: false, message: 'Lỗi server khi hủy số điện thoại.' });
    }
};

module.exports = phoneApiController;