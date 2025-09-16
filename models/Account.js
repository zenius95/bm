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
        // === START: THAY ĐỔI QUAN TRỌNG ===
        enum: ['UNCHECKED', 'LIVE', 'DIE', 'CHECKING', 'ERROR', 'IN_USE'],
        // === END: THAY ĐỔI QUAN TRỌNG ===
        default: 'UNCHECKED'
    },
    dieStreak: {
        type: Number,
        default: 0
    },
    isDeleted: { type: Boolean, default: false, index: true },
    lastCheckedAt: {
        type: Date,
        default: null
    },
    deletedAt: { type: Date, default: null },
}, {
    timestamps: true
});

module.exports = mongoose.model('Account', AccountSchema);