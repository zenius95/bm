// controllers/phoneApiController.js
const PhoneNumber = require('../models/PhoneNumber');
const fetch = require('node-fetch');
const settingsService = require('../utils/settingsService'); // Thêm service để lấy master key

// --- Hàm xác thực nội bộ ---
const authenticateRequest = (req) => {
    const apiKey = req.query.apiKey;
    const masterApiKey = settingsService.get('masterApiKey');

    if (!apiKey) {
        return { success: false, message: 'Unauthorized: API Key is missing.' };
    }
    if (apiKey !== masterApiKey) {
        return { success: false, message: 'Unauthorized: Invalid API Key.' };
    }
    return { success: true };
};


const phoneApiController = {};

/**
 * Lấy một số điện thoại khả dụng và đánh dấu là IN_USE.
 */
phoneApiController.getPhoneNumber = async (req, res) => {
    const authResult = authenticateRequest(req);
    if (!authResult.success) {
        return res.status(401).json(authResult);
    }

    try {
        const { country, source } = req.query;
        let phone = null;

        const query = {
            status: 'AVAILABLE',
            isDeleted: false
        };

        if (country) query.country = country;
        if (source) query.source = source;
        
        // === START: LOGIC LẤY SỐ ĐIỆN THOẠI MỚI ===
        // Nếu không có bộ lọc, ưu tiên lấy ngẫu nhiên để tăng hiệu quả
        if (!country && !source) {
            // Bước 1: Lấy ngẫu nhiên 1 document ID
            const randomPhones = await PhoneNumber.aggregate([
                { $match: query },
                { $sample: { size: 1 } },
                { $project: { _id: 1 } }
            ]);

            if (randomPhones.length > 0) {
                const randomPhoneId = randomPhones[0]._id;
                // Bước 2: Cố gắng "khóa" document đó một cách an toàn
                phone = await PhoneNumber.findOneAndUpdate(
                    { _id: randomPhoneId, status: 'AVAILABLE' }, // Đảm bảo nó vẫn available
                    { $set: { status: 'IN_USE', lastUsedAt: new Date() } },
                    { new: true }
                ).lean();
            }
        }
        
        // Nếu lấy ngẫu nhiên không thành công (có thể do race condition) hoặc có bộ lọc,
        // quay trở lại phương thức tìm kiếm tuần tự.
        if (!phone) {
            phone = await PhoneNumber.findOneAndUpdate(
                query,
                {
                    $set: {
                        status: 'IN_USE',
                        lastUsedAt: new Date()
                    }
                },
                {
                    new: true,
                    sort: { updatedAt: 1 } // Lấy số cũ nhất để xoay vòng
                }
            ).lean();
        }
        // === END: LOGIC LẤY SỐ ĐIỆN THOẠI MỚI ===

        if (!phone) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy số điện thoại nào khả dụng với tiêu chí đã chọn.' });
        }

        res.json({ success: true, phone });

    } catch (error) {
        console.error('[PhoneAPI] Error getting phone number:', error);
        res.status(500).json({ success: false, message: 'Lỗi server khi lấy số điện thoại.' });
    }
};

/**
 * Lấy code Instagram từ một số điện thoại cụ thể.
 */
phoneApiController.getCode = async (req, res) => {
    const authResult = authenticateRequest(req);
    if (!authResult.success) {
        return res.status(401).json(authResult);
    }
    
    const { phoneNumber, country, source } = req.query;

    if (!phoneNumber || !country || !source) {
        return res.status(400).json({ success: false, message: 'Thiếu thông tin phoneNumber, country, hoặc source.' });
    }

    try {
        const url = `https://otp-api.shelex.dev/api/${country}/${phoneNumber}?source=${source}`;
        const response = await fetch(url, {
             headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        
        if (!response.ok) {
            throw new Error(`API trả về lỗi: ${response.statusText}`);
        }

        const data = await response.json();
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


/**
 * Hủy/nhả một số điện thoại đang IN_USE.
 */
phoneApiController.cancelPhoneNumber = async (req, res) => {
    const authResult = authenticateRequest(req);
    if (!authResult.success) {
        return res.status(401).json(authResult);
    }

    const { phoneNumberId } = req.query;
    if (!phoneNumberId) {
        return res.status(400).json({ success: false, message: 'Vui lòng cung cấp ID của số điện thoại (phoneNumberId).' });
    }

    try {
        const phone = await PhoneNumber.findOneAndUpdate(
            { _id: phoneNumberId, status: 'IN_USE' },
            {
                $set: {
                    status: 'AVAILABLE',
                    lastUsedAt: null
                }
            },
            { new: true }
        );

        if (!phone) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy số điện thoại đang sử dụng với ID này.' });
        }

        res.json({ success: true, message: `Đã hủy và trả số ${phone.phoneNumber} về trạng thái AVAILABLE.` });

    } catch (error) {
        console.error('[PhoneAPI] Error canceling phone number:', error);
        res.status(500).json({ success: false, message: 'Lỗi server khi hủy số điện thoại.' });
    }
};


module.exports = phoneApiController;