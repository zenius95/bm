// models/Log.js
const mongoose = require('mongoose');

const LogSchema = new mongoose.Schema({
    orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: true,
        index: true // Đánh index để truy vấn nhanh hơn
    },
    level: {
        type: String,
        enum: ['INFO', 'ERROR'],
        default: 'INFO'
    },
    message: {
        type: String,
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Log', LogSchema);