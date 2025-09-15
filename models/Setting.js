// models/Setting.js
const mongoose = require('mongoose');

const SettingSchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    value: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    }
});

// Hàm helper để lấy hoặc tạo cài đặt mặc định
SettingSchema.statics.get = async function(key, defaultValue) {
    const setting = await this.findOne({ key });
    if (setting) {
        return setting.value;
    }
    return defaultValue;
};

// Hàm helper để cập nhật hoặc tạo mới cài đặt
SettingSchema.statics.set = async function(key, value) {
    return this.findOneAndUpdate(
        { key },
        { $set: { value } },
        { upsert: true, new: true }
    );
};

module.exports = mongoose.model('Setting', SettingSchema);