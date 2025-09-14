// models/Order.js
const mongoose = require('mongoose');

const ItemSchema = new mongoose.Schema({
    data: { type: String, required: true },
    status: {
        type: String,
        enum: ['queued', 'processing', 'completed', 'failed'],
        default: 'queued'
    },
});

const OrderSchema = new mongoose.Schema({
    items: [ItemSchema],
    status: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed'],
        default: 'pending'
    },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    // Trường 'createdAt' đã được xóa bỏ khỏi đây
}, {
    timestamps: true // Tùy chọn này sẽ tự động quản lý createdAt và updatedAt
});

module.exports = mongoose.model('Order', OrderSchema);