// models/PhoneNumber.js
const mongoose = require('mongoose');

const PhoneNumberSchema = new mongoose.Schema({
    phoneNumber: {
        type: String,
        required: true,
        trim: true
    },
    country: {
        type: String,
        required: true,
        trim: true,
        index: true
    },
    source: {
        type: String,
        required: true,
        trim: true,
        index: true
    },
    isDeleted: {
        type: Boolean,
        default: false,
        index: true
    },
    deletedAt: {
        type: Date,
        default: null
    },
}, {
    timestamps: true
});

// Create an index to optimize search and prevent duplicates
PhoneNumberSchema.index({ phoneNumber: 1, country: 1, source: 1 }, { unique: true });

module.exports = mongoose.model('PhoneNumber', PhoneNumberSchema);