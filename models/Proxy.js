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
        enum: ['AVAILABLE', 'DEAD', 'CHECKING', 'UNCHECKED'], // Đã xóa 'ASSIGNED'
        default: 'UNCHECKED'
    },
    previousStatus: {
        type: String,
        enum: ['AVAILABLE', 'DEAD', 'UNCHECKED', null], // Đã xóa 'ASSIGNED'
        default: null
    },
    // Đã xóa trường assignedTo
    notes: {
        type: String,
        trim: true
    },
    lastCheckedAt: { 
        type: Date,
        default: null
    },
    // Thêm trường mới để theo dõi lần sử dụng cuối
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