// config.js
require('dotenv').config();

const config = {
    mongodb: {
        uri: process.env.MONGO_URI || 'mongodb://localhost:27017/order_processor',
    },
    server: {
        port: parseInt(process.env.PORT, 10) || 3000,
    },
};

module.exports = config;