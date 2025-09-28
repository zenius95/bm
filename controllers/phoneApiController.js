// controllers/phoneApiController.js
const PhoneNumber = require('../models/PhoneNumber');
const fetch = require('node-fetch');
const settingsService = require('../utils/settingsService');

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

        const { phoneNumber, country, source } = phoneRecord;

        const url = `https://otp-api.shelex.dev/api/${country}/${phoneNumber}?source=${source}`;

        console.log(url)

        const response = await fetch(url, {
             headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        
        if (!response.ok) {
            throw new Error(`API trả về lỗi: ${response.statusText}`);
        }

        const data = await response.json();

        console.log(data)

        const apiResult = data && data[0];
        
        if (!apiResult || !Array.isArray(apiResult.results)) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy tin nhắn nào hoặc cấu trúc API không đúng.' });
        }
        
        for (const message of apiResult.results) {
            if (message.message && message.message.toLowerCase().includes('instagram')) {
                const codeMatch = message.message.match(/\b(\d{6})\b/);
                if (codeMatch && codeMatch[1]) {
                    return res.json({ success: true, code: codeMatch[1], fullMessage: message.message });
                }
            }
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