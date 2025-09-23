// models/Account.js
const mongoose = require('mongoose');

const AccountSchema = new mongoose.Schema({
    uid: {
        type: String,
        required: true,
        unique: true,
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
    email: {
        type: String,
        trim: true,
        default: ''
    },
    proxy: {
        type: String,
        default: ''
    },
    status: {
        type: String,
        enum: ['UNCHECKED', 'LIVE', 'DIE', 'CHECKING', 'ERROR', 'IN_USE', 'RESTING'],
        default: 'UNCHECKED'
    },
    previousStatus: {
        type: String,
        enum: ['UNCHECKED', 'LIVE', 'DIE', 'ERROR', 'IN_USE', 'RESTING', null],
        default: null
    },
    dieStreak: {
        type: Number,
        default: 0
    },
    successCount: {
        type: Number,
        default: 0
    },
    errorCount: {
        type: Number,
        default: 0
    },
    lastUsedAt: {
        type: Date,
        default: null
    },
    // === START: THÊM CÁC TRƯỜNG MỚI ĐỂ LƯU SĐT ===
    lastUsedPhone: {
        type: String,
        default: null
    },
    lastUsedPhoneId: {
        type: String,
        default: null
    },
    lastUsedPhoneCode: {
        type: String,
        default: null
    },
    // === END: THÊM CÁC TRƯỜNG MỚI ĐỂ LƯU SĐT ===
    isDeleted: { type: Boolean, default: false, index: true },
    lastCheckedAt: {
        type: Date,
        default: null
    },
    deletedAt: { type: Date, default: null },
}, {
    timestamps: true
});

// === START: TỐI ƯU HÓA HIỆU NĂNG ===
// Thêm một chỉ mục kết hợp để tăng tốc độ truy vấn tìm kiếm account khả dụng.
// MongoDB sẽ sử dụng chỉ mục này để tìm kiếm cực nhanh các tài khoản có status='LIVE',
// isDeleted=false và sắp xếp theo lastUsedAt mà không cần phải quét toàn bộ bảng.
AccountSchema.index({ status: 1, isDeleted: 1, lastUsedAt: 1 });
// === END: TỐI ƯU HÓA HIỆU NĂNG ===


module.exports = mongoose.model('Account', AccountSchema);