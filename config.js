// config.js
require('dotenv').config(); // Nạp các biến môi trường từ file .env

const config = {
    // Cấu hình kết nối MongoDB
    mongodb: {
        uri: process.env.MONGO_URI || 'mongodb://localhost:27017/order_processor',
    },

    // Cấu hình kết nối Redis
    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT, 10) || 6379,
        password: process.env.REDIS_PASSWORD || undefined, // Mật khẩu, nếu có
    },
    
    // Cấu hình server
    server: {
        port: parseInt(process.env.PORT, 10) || 3000,
    },

    admin: {
        user: process.env.ADMIN_USER || 'admin',
        password: process.env.ADMIN_PASSWORD || '123456'
    }
};

module.exports = config;