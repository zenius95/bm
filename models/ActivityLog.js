// models/ActivityLog.js
const mongoose = require('mongoose');

const ActivityLogSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    action: {
        type: String,
        required: true,
        trim: true
    },
    details: {
        type: String,
        trim: true,
        default: ''
    },
    ipAddress: {
        type: String,
        default: 'N/A'
    },
    context: {
        type: String,
        enum: ['Admin', 'Client'],
        default: 'Client'
    },
    // --- THÊM TRƯỜNG MỚI ---
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('ActivityLog', ActivityLogSchema);