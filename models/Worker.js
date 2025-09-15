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
        type: String, 
        required: true,
    },
    isLocal: {
        type: Boolean,
        default: false
    },
    // === START: THAY ĐỔI QUAN TRỌNG ===
    isEnabled: {
        type: Boolean,
        default: true
    },
    // === END: THAY ĐỔI QUAN TRỌNG ===
    concurrency: {
        type: Number,
        default: 10,
        min: 1
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
        queuedTasks: { type: Number, default: 0 },
        pendingOrders: { type: Number, default: 0 },
        processingItems: { type: Number, default: 0 },
        liveAccounts: { type: Number, default: 0 },
        totalAccounts: { type: Number, default: 0 }
    },
    lastSeen: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

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
                status: 'online',
                concurrency: 10
            });
            await localWorker.save();
        }
    } catch (error) {
        console.error('Failed to initialize local worker:', error);
    }
};

module.exports = mongoose.model('Worker', WorkerSchema);