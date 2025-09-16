// models/Item.js
const mongoose = require('mongoose');
const shortId = require('short-id');

const ItemSchema = new mongoose.Schema({
    // ID ngắn để dễ dàng tham chiếu và log
    shortId: {
        type: String,
        unique: true,
        index: true
    },
    // Tham chiếu đến đơn hàng cha
    orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: true,
        index: true
    },
    // Dữ liệu chính của item (ví dụ: uid|pass|2fa)
    data: { 
        type: String, 
        required: true 
    },
    // Trạng thái xử lý của item
    status: {
        type: String,
        enum: ['queued', 'processing', 'completed', 'failed'],
        default: 'queued',
        index: true // Đánh index để truy vấn nhanh các item đang chờ
    },
    // Ghi lại worker nào đã xử lý item này (tùy chọn, hữu ích cho việc debug)
    processedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Worker',
        default: null
    },
    // Ghi lại account nào đã được dùng để xử lý (tùy chọn)
    processedWith: {
         type: mongoose.Schema.Types.ObjectId,
        ref: 'Account',
        default: null
    }
}, {
    timestamps: true // Tự động thêm createdAt và updatedAt
});

// Tự động tạo shortId trước khi lưu
ItemSchema.pre('save', function(next) {
    if (this.isNew) {
        this.shortId = shortId.generate();
    }
    next();
});

module.exports = mongoose.model('Item', ItemSchema);