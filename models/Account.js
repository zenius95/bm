// models/Account.js
const mongoose = require('mongoose');

const AccountSchema = new mongoose.Schema({
    uid: {
        type: String,
        required: true,
        unique: true, // Đảm bảo không có username trùng lặp
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    twofa: {
        type: String,
        required: true
    },
    proxy: {
        type: String,
        default: '' // Không bắt buộc
    },
    status: {
        type: String,
        enum: ['UNCHECKED', 'LIVE', 'DIE', 'CHECKING', 'ERROR'],
        default: 'UNCHECKED'
    },
    // === START: THAY ĐỔI QUAN TRỌNG ===
    dieStreak: {
        type: Number,
        default: 0
    },
    // === END: THAY ĐỔI QUAN TRỌNG ===
    isDeleted: { type: Boolean, default: false, index: true },
    lastCheckedAt: {
        type: Date,
        default: null
    },
    deletedAt: { type: Date, default: null },
}, {
    timestamps: true // Tùy chọn này sẽ tự động quản lý createdAt và updatedAt
});

module.exports = mongoose.model('Account', AccountSchema);