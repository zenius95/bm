// config.js
require('dotenv').config(); // Nạp các biến môi trường từ file .env

const config = {
    // Cấu hình kết nối MongoDB
    mongodb: {
        uri: process.env.MONGO_URI || 'mongodb://localhost:27017/order_processor',
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