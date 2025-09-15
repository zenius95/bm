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
    }
}, {
    timestamps: true // Tự động thêm createdAt và updatedAt
});

module.exports = mongoose.model('ActivityLog', ActivityLogSchema);