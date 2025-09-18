// models/Proxy.js
const mongoose = require('mongoose');

const ProxySchema = new mongoose.Schema({
    proxyString: {
        type: String,
        required: [true, 'Proxy string is required.'],
        unique: true,
        trim: true,
        match: [/^(http|https|socks4|socks5):\/\/(?:[^:]+:[^@]+@)?([^:]+):(\d+)$/, 'Invalid proxy format after conversion.']
    },
    status: {
        type: String,
        enum: ['AVAILABLE', 'ASSIGNED', 'DEAD', 'CHECKING', 'UNCHECKED'],
        default: 'UNCHECKED'
    },
    // === START: THÊM TRƯỜNG MỚI ===
    previousStatus: {
        type: String,
        enum: ['AVAILABLE', 'ASSIGNED', 'DEAD', 'UNCHECKED', null],
        default: null
    },
    // === END: THÊM TRƯỜNG MỚI ===
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Account',
        default: null
    },
    notes: {
        type: String,
        trim: true
    },
    lastCheckedAt: { 
        type: Date,
        default: null
    },
    // Thêm các trường cho thùng rác
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
}, {
    timestamps: true
});

module.exports = mongoose.model('Proxy', ProxySchema);