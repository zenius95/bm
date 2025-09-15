// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const basicAuth = require('express-basic-auth');
const config = require('./config');
const { orderQueue } = require('./queue');
const path = require('path');

// Import các routes
const adminRoutes = require('./routes/admin');
const orderRoutes = require('./routes/order');
// const { initializeCronJobs } = require('./cronjobs'); // XÓA DÒNG NÀY
const autoCheckManager = require('./utils/autoCheckManager'); // THÊM DÒNG NÀY

const app = express();
// --- THAY ĐỔI: Khởi tạo http server và io ở đây ---
const http = require('http');
const { Server } = require("socket.io");
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
// --------------------------------------------------

// --- Cấu hình View Engine ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '/views'));

// --- Middlewares ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- THAY ĐỔI: Gắn io vào mỗi request ---
app.use((req, res, next) => {
    req.io = io;
    next();
});
// ---------------------------------------

// --- Authentication cho Admin ---
const adminUser = { [config.admin.user]: config.admin.password };
const authMiddleware = basicAuth({
    users: adminUser,
    challenge: true,
    unauthorizedResponse: 'Unauthorized access.'
});

// --- Sử dụng Routes ---
app.use('/admin', authMiddleware, adminRoutes);
app.use('/api', orderRoutes);

// --- Các hàm kiểm tra kết nối ---
async function checkMongoDBConnection() {
    try {
        await mongoose.connect(config.mongodb.uri);
        console.log('✅ MongoDB connection: OK');
    } catch (error) {
        console.error('❌ MongoDB connection: FAILED');
        throw error;
    }
}

async function checkRedisConnection() {
    try {
        const redisClient = await orderQueue.client;
        const pingResponse = await redisClient.ping();
        if (pingResponse !== 'PONG') {
            throw new Error('Did not receive PONG.');
        }
        console.log('✅ Redis connection: OK (Received PONG)');
    } catch (error) {
        console.error('❌ Redis connection: FAILED');
        throw error;
    }
}

// --- Hàm khởi động chính ---
async function startServer() {
    console.log('🚀 Starting server, checking all connections...');
    const connectionPromises = [
        checkMongoDBConnection(),
        checkRedisConnection()
    ];
    const results = await Promise.allSettled(connectionPromises);
    let allConnectionsOK = true;

    console.log('--- Connection Status ---');
    results.forEach(result => {
        if (result.status === 'rejected') {
            allConnectionsOK = false;
        }
    });
    console.log('-------------------------');

    if (allConnectionsOK) {
        // --- THAY ĐỔI: Dùng server.listen thay vì app.listen ---
        server.listen(config.server.port, () => {
            console.log(`\n🎉 Server started successfully!`);
            console.log(`   - API is running on http://localhost:${config.server.port}`);
            console.log(`   - Admin Dashboard is available at http://localhost:${config.server.port}/admin/dashboard`);
            
            // === START: THAY ĐỔI QUAN TRỌNG ===
            // Khởi chạy auto check manager
            autoCheckManager.initialize(io);
            // === END: THAY ĐỔI QUAN TRỌNG ===
        });
    } else {
        console.error('\n❌ Failed to start server due to one or more connection errors.');
        console.log('   Please check the logs above and ensure all services are running correctly.');
        process.exit(1);
    }
}

// Chạy hàm khởi động
startServer();