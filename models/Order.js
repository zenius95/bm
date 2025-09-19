// models/Order.js
const mongoose = require('mongoose');
const shortId = require('short-id');
const Item = require('./Item');
const Log = require('./Log');

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

// === START: THÊM LOGIC TỰ ĐỘNG DỌN DẸP DỮ LIỆU LIÊN QUAN ===
OrderSchema.pre('deleteMany', { document: false, query: true }, async function(next) {
    try {
        console.log('🔥 Kích hoạt pre-deleteMany hook cho Order...');
        // 'this' ở đây là query object
        const ordersToDelete = await this.model.find(this.getFilter()).select('_id').lean();
        const orderIds = ordersToDelete.map(order => order._id);

        if (orderIds.length > 0) {
            console.log(`- Chuẩn bị xóa items và logs cho ${orderIds.length} đơn hàng.`);
            
            // Xóa tất cả các items liên quan
            const itemDeletionResult = await Item.deleteMany({ orderId: { $in: orderIds } });
            console.log(`- Đã xóa ${itemDeletionResult.deletedCount} items.`);

            // Xóa tất cả các logs liên quan
            const logDeletionResult = await Log.deleteMany({ orderId: { $in: orderIds } });
            console.log(`- Đã xóa ${logDeletionResult.deletedCount} logs.`);
        }
        next();
    } catch (error) {
        console.error('Lỗi trong pre-deleteMany hook của Order:', error);
        // Chuyển lỗi cho middleware tiếp theo để xử lý
        next(error);
    }
});
// === END: THÊM LOGIC TỰ ĐỘNG DỌN DẸP DỮ LIÊN QUAN ===


module.exports = mongoose.model('Order', OrderSchema);