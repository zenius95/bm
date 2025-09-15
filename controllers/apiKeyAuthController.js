// controllers/apiKeyAuthController.js
const Worker = require('../models/Worker');

const apiKeyAuth = async (req, res, next) => {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
        return res.status(401).json({ success: false, message: 'Unauthorized: API Key is missing.' });
    }

    try {
        // Tìm worker đang hoạt động với API key tương ứng
        const worker = await Worker.findOne({ apiKey: apiKey, isEnabled: true });

        if (!worker) {
            return res.status(401).json({ success: false, message: 'Unauthorized: Invalid API Key.' });
        }

        // Gắn thông tin worker vào request để có thể dùng sau này nếu cần
        req.worker = worker;
        next();

    } catch (error) {
        console.error("API Key Auth Error:", error);
        res.status(500).json({ success: false, message: 'Server error during authentication.' });
    }
};

module.exports = apiKeyAuth;