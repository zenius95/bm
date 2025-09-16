// models/Order.js
const mongoose = require('mongoose');
const shortId = require('short-id');

// ItemSchema không còn ở đây nữa
// const ItemSchema = new mongoose.Schema({ ... });

const OrderSchema = new mongoose.Schema({
    shortId: {
        type: String,
        unique: true,
        index: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    totalCost: {
        type: Number,
        required: true,
        default: 0
    },
    pricePerItem: {
        type: Number,
        required: true
    },
    // === START: THAY ĐỔI QUAN TRỌNG ===
    // Xóa trường 'items' cũ
    // items: [ItemSchema], 
    
    // Thêm các trường để theo dõi tiến độ tổng quan
    totalItems: {
        type: Number,
        default: 0
    },
    completedItems: {
        type: Number,
        default: 0
    },
    failedItems: {
        type: Number,
        default: 0
    },
    // === END: THAY ĐỔI QUAN TRỌNG ===
    status: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed'],
        default: 'pending',
        index: true
    },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
}, {
    timestamps: true 
});

OrderSchema.pre('save', function(next) {
    if (this.isNew) {
        this.shortId = shortId.generate().toUpperCase();
    }
    next();
});

module.exports = mongoose.model('Order', OrderSchema);