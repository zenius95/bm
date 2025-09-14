// worker.js
const { Worker } = require('bullmq');
const mongoose = require('mongoose');
const Order = require('./models/Order');
const Log = require('./models/Log'); // Import Log model
const { QUEUE_NAME } = require('./queue');
const config = require('./config');

console.log('👷 Worker is starting...');

mongoose.connect(config.mongodb.uri)
    .then(() => console.log('✅ [Worker] Connected to MongoDB'))
    .catch(err => {
        console.error('❌ [Worker] Could not connect to MongoDB', err);
        process.exit(1);
    });

// --- Hàm helper để ghi log ---
async function writeLog(orderId, level, message) {
    try {
        const log = new Log({ orderId, level, message });
        await log.save();
        console.log(`[Log][${level}] Order ${orderId}: ${message}`);
    } catch (error) {
        console.error(`Failed to write log for order ${orderId}:`, error);
    }
}

const worker = new Worker(QUEUE_NAME, async (job) => {
    const { orderId } = job.data;
    
    await writeLog(orderId, 'INFO', `Processing job ${job.id} started.`);

    try {
        await Order.findByIdAndUpdate(orderId, { status: 'processing' });
        await writeLog(orderId, 'INFO', `Order status updated to 'processing'.`);

        const order = await Order.findById(orderId);
        if (!order) throw new Error(`Order ${orderId} not found.`);

        for (const item of order.items) {
            await writeLog(orderId, 'INFO', `Starting to process item ${item._id} with data: "${item.data}"`);
            await new Promise(resolve => setTimeout(resolve, 2000)); // Giả lập xử lý
            
            await Order.updateOne(
                { "_id": orderId, "items._id": item._id },
                { "$set": { "items.$.status": "completed" } }
            );
            await writeLog(orderId, 'INFO', `Item ${item._id} completed.`);
        }

        await Order.findByIdAndUpdate(orderId, { status: 'completed' });
        await writeLog(orderId, 'INFO', 'Order status updated to \'completed\'. Job finished successfully.');
        
        return { status: 'done' };
        
    } catch (error) {
        console.error(`[Worker] Job ${job.id} failed for order ${orderId}: ${error.message}`);
        await Order.findByIdAndUpdate(orderId, { status: 'failed' });
        // Ghi log lỗi
        await writeLog(orderId, 'ERROR', `Job failed. Error: ${error.message}`);
        throw error;
    }
}, { connection: config.redis });

worker.on('completed', (job, result) => {
    console.log(`[Worker] Job ${job.id} has completed with result:`, result);
});

worker.on('failed', (job, err) => {
    console.log(`[Worker] Job ${job.id} has failed with ${err.message}`);
});