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
    // === START: THAY ĐỔI QUAN TRỌNG ===
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
    // === END: THAY ĐỔI QUAN TRỌNG ===
    items: [ItemSchema],
    status: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed'],
        default: 'pending'
    },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
}, {
    timestamps: true 
});

module.exports = mongoose.model('Order', OrderSchema);