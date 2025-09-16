// models/Order.js
const mongoose = require('mongoose');
const shortId = require('short-id');

const ItemSchema = new mongoose.Schema({
    data: { type: String, required: true },
    status: {
        type: String,
        enum: ['queued', 'processing', 'completed', 'failed'],
        default: 'queued'
    },
});

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

OrderSchema.pre('save', function(next) {
    if (this.isNew) {
        this.shortId = shortId.generate().toUpperCase();
    }
    next();
});

module.exports = mongoose.model('Order', OrderSchema);