// models/Worker.js
const mongoose = require('mongoose');

const WorkerSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    url: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    username: {
        type: String,
        required: true,
    },
    password: {
        type: String, // Trong thực tế nên mã hóa trường này
        required: true,
    },
    isLocal: {
        type: Boolean,
        default: false
    },
    status: {
        type: String,
        enum: ['offline', 'online', 'error'],
        default: 'offline'
    },
    stats: {
        cpu: { type: Number, default: 0 },
        freeMem: { type: Number, default: 0 },
        totalMem: { type: Number, default: 0 },
        activeTasks: { type: Number, default: 0 },
        queuedTasks: { type: Number, default: 0 }
    },
    lastSeen: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// Tạo một worker cục bộ mặc định nếu chưa có
WorkerSchema.statics.initializeLocalWorker = async function() {
    try {
        const existingLocal = await this.findOne({ isLocal: true });
        if (!existingLocal) {
            console.log('Creating default local worker...');
            const localWorker = new this({
                name: 'Main Server Worker',
                url: 'http://localhost:' + (process.env.PORT || 3000),
                username: process.env.ADMIN_USER || 'admin',
                password: process.env.ADMIN_PASSWORD || '123456',
                isLocal: true,
                status: 'online'
            });
            await localWorker.save();
        }
    } catch (error) {
        console.error('Failed to initialize local worker:', error);
    }
};


module.exports = mongoose.model('Worker', WorkerSchema);