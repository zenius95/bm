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
        enum: ['UNCHECKED', 'LIVE', 'DIE', 'CHECKING'],
        default: 'UNCHECKED'
    },
    lastCheckedAt: {
        type: Date,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Account', AccountSchema);