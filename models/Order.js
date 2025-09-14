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
        enum: ['pending', 'processing', 'completed'],
        default: 'pending'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Order', OrderSchema);