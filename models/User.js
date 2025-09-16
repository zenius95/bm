// models/User.js

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        // === START: THÊM VALIDATOR ===
        validate: {
            validator: function(v) {
                // Chỉ cho phép chữ, số, và dấu gạch dưới
                return /^[a-zA-Z0-9_]+$/.test(v);
            },
            message: props => `${props.value} không phải là username hợp lệ! Chỉ cho phép chữ, số và dấu gạch dưới.`
        }
        // === END: THÊM VALIDATOR ===
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        match: [/\S+@\S+\.\S+/, 'is invalid']
    },
    password: {
        type: String,
        required: true,
    },
    role: {
        type: String,
        enum: ['admin', 'user'],
        default: 'user'
    },
    balance: {
        type: Number,
        default: 0
    },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
}, {
    timestamps: true
});

// Middleware để hash mật khẩu trước khi lưu
UserSchema.pre('save', async function(next) {
    if (!this.isModified('password')) {
        return next();
    }
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (err) {
        next(err);
    }
});

// Method để so sánh mật khẩu
UserSchema.methods.comparePassword = function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);