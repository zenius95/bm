// queue.js
const { Queue } = require('bullmq');
const config = require('./config'); // Import config

const QUEUE_NAME = 'order-processing';

// Sử dụng cấu hình Redis từ file config
const orderQueue = new Queue(QUEUE_NAME, { connection: config.redis });

module.exports = { orderQueue, QUEUE_NAME };