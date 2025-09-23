// models/Proxy.js
const mongoose = require('mongoose');

const ProxySchema = new mongoose.Schema({
    proxyString: {
        type: String,
        required: [true, 'Proxy string is required.'],
        unique: true,
        trim: true,
        // Sửa lỗi: Cập nhật Regex để hỗ trợ cả Hostname, IPv4, và IPv6 literal
        match: [/^(http|https|socks4|socks5):\/\/(?:[^:]+:[^@]+@)?(\[[a-fA-F0-9:]+\]|[^:]+):(\d+)$/, 'Invalid proxy format after conversion.']
    },
    status: {
        type: String,
        enum: ['AVAILABLE', 'DEAD', 'CHECKING', 'UNCHECKED'],
        default: 'UNCHECKED'
    },
    previousStatus: {
        type: String,
        enum: ['AVAILABLE', 'DEAD', 'UNCHECKED', null],
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
    lastUsedAt: {
        type: Date,
        default: null
    },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
}, {
    timestamps: true
});

module.exports = mongoose.model('Proxy', ProxySchema);