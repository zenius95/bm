// controllers/phoneApiController.js
const PhoneNumber = require('../models/PhoneNumber');
const settingsService = require('../utils/settingsService');
const { getCodeFromPhonePage } = require('../utils/phoneScraper');

// --- START: HÀM TIỆN ÍCH ĐÃ SỬA LỖI ---
/**
 * Chuyển đổi chuỗi thời gian (vd: "5m", "2h", "3M") thành số giây.
 * @param {string} timeString - Chuỗi thời gian đầu vào.
 * @returns {number|null} - Tổng số giây, hoặc null nếu không hợp lệ.
 */
function parseMaxAge(timeString) {
    if (!timeString) return null;
    // SỬA LỖI: Bỏ .toLowerCase() để phân biệt 'm' (phút) và 'M' (tháng)
    const match = timeString.match(/^(\d+)([smhdM])$/);
    if (!match) return null;

    const value = parseInt(match[1], 10);
    const unit = match[2]; // Giữ nguyên chữ hoa/thường

    switch (unit) {
        case 's': return value; // Giây
        case 'm': return value * 60; // Phút
        case 'h': return value * 3600; // Giờ
        case 'd': return value * 86400; // Ngày
        case 'M': return value * 2592000; // Tháng (ước lượng 30 ngày)
        default: return null;
    }
}
// --- END: HÀM TIỆN ÍCH ĐÃ SỬA LỖI ---

const authenticateRequest = (req) => {
    // ... (Hàm này giữ nguyên)
    const apiKey = req.query.apiKey;
    const masterApiKey = settingsService.get('masterApiKey');
    if (!apiKey) return { success: false, message: 'Unauthorized: API Key is missing.' };
    if (apiKey !== masterApiKey) return { success: false, message: 'Unauthorized: Invalid API Key.' };
    return { success: true };
};

const phoneApiController = {};

phoneApiController.getPhoneNumber = async (req, res) => {
    // ... (Hàm này giữ nguyên)
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

// === HÀM ĐƯỢC NÂNG CẤP ===
phoneApiController.getCode = async (req, res) => {
    const authResult = authenticateRequest(req);
    if (!authResult.success) {
        return res.status(401).json(authResult);
    }
    
    // Mặc định là 5 phút ("5m")
    const { phoneNumberId, service = 'instagram', maxAge = '5m' } = req.query; 
    
    if (!phoneNumberId) {
        return res.status(400).json({ success: false, message: 'Thiếu thông tin phoneNumberId.' });
    }

    const maxAgeInSeconds = parseMaxAge(maxAge);
    if (maxAgeInSeconds === null) {
        // Cập nhật thông báo lỗi để rõ ràng hơn
        return res.status(400).json({ success: false, message: 'maxAge không hợp lệ. Dùng "s" (giây), "m" (phút), "h" (giờ), "d" (ngày), "M" (tháng). Ví dụ: 30s, 10m, 2h, 3d, 1M.' });
    }

    try {
        const phoneRecord = await PhoneNumber.findById(phoneNumberId).lean();
        if (!phoneRecord) {
            return res.status(404).json({ success: false, message: `ID số điện thoại ${phoneNumberId} không được tìm thấy.` });
        }

        const { phoneNumber, country } = phoneRecord;

        const result = await getCodeFromPhonePage(country, phoneNumber, service, maxAgeInSeconds);

        if (result.code) {
            return res.json({ 
                success: true, 
                code: result.code, 
                fullMessage: result.latestMessage, 
                messages: result.allMessages
            });
        }
        
        return res.status(404).json({ 
            success: false, 
            message: `Không tìm thấy code cho '${service}' trong vòng ${maxAge} gần đây.`,
            messages: result.allMessages
        });

    } catch (error) {
        console.error('[PhoneAPI] Error getting code:', error);
        res.status(500).json({ success: false, message: 'Lỗi server khi lấy code.', error: error.message });
    }
};
// === KẾT THÚC NÂNG CẤP ===

phoneApiController.cancelPhoneNumber = async (req, res) => {
    // ... (Hàm này giữ nguyên)
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