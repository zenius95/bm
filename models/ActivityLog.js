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
    // === START: THÊM TRƯỜNG MỚI ===
    context: {
        type: String,
        enum: ['Admin', 'Client'],
        default: 'Client'
    },
    isDeleted: { 
        type: Boolean, 
        default: false, 
        index: true 
    },
    // === END ===
}, {
    timestamps: true
});

module.exports = mongoose.model('ActivityLog', ActivityLogSchema);