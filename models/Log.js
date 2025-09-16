// models/Log.js
const mongoose = require('mongoose');

const LogSchema = new mongoose.Schema({
    orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: true,
        index: true 
    },
    itemId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Item',
        index: true // Rất quan trọng để truy vấn log theo item nhanh
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