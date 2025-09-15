// models/Worker.js
const mongoose = require('mongoose');
const crypto = require('crypto');

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
    apiKey: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    isLocal: {
        type: Boolean,
        default: false
    },
    isEnabled: {
        type: Boolean,
        default: true
    },
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
                // Tự tạo một API key cho worker local
                apiKey: crypto.randomBytes(32).toString('hex'),
                isLocal: true,
                status: 'online',
                concurrency: 10
            });
            await localWorker.save();
        } else if (!existingLocal.apiKey) {
            // Đảm bảo worker local cũ cũng có apiKey
            existingLocal.apiKey = crypto.randomBytes(32).toString('hex');
            await existingLocal.save();
            console.log('Updated local worker with a new API key.');
        }
    } catch (error) {
        console.error('Failed to initialize local worker:', error);
    }
};

module.exports = mongoose.model('Worker', WorkerSchema);