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