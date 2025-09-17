// models/Item.js
const mongoose = require('mongoose');
// const shortId = require('short-id'); // Không cần nữa

const ItemSchema = new mongoose.Schema({
    // shortId đã được loại bỏ
    orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: true,
        index: true
    },
    data: { 
        type: String, 
        required: true,
        trim: true,
    },
    status: {
        type: String,
        enum: ['queued', 'processing', 'completed', 'failed'],
        default: 'queued',
        index: true
    },
    processedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Worker',
        default: null
    },
    processedWith: {
         type: mongoose.Schema.Types.ObjectId,
        ref: 'Account',
        default: null
    }
}, {
    timestamps: true
});

// Hook pre('save') để tạo shortId đã được loại bỏ

module.exports = mongoose.model('Item', ItemSchema);