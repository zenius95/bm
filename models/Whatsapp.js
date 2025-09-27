// models/Whatsapp.js
const mongoose = require('mongoose');

const WhatsappSchema = new mongoose.Schema({
    sessionId: {
        type: String,
        required: true,
        unique: true,
    },
    status: {
        type: String,
        enum: ['DISCONNECTED', 'CONNECTED', 'SCAN_QR', 'LOADING'],
        default: 'DISCONNECTED'
    },
    // --- START: THÊM CÁC TRƯỜNG MỚI ---
    previousStatus: {
        type: String,
        enum: ['DISCONNECTED', 'CONNECTED', 'SCAN_QR', null],
        default: null
    },
    lastCheckedAt: {
        type: Date,
        default: null
    },
    // --- END: THÊM CÁC TRƯỜNG MỚI ---
    phoneNumber: {
        type: String,
        default: 'N/A'
    },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
}, {
    timestamps: true
});

module.exports = mongoose.model('Whatsapp', WhatsappSchema);