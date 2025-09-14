// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const basicAuth = require('express-basic-auth');
const config = require('./config');
const { orderQueue } = require('./queue');

// Import các routes đã được tách biệt
const adminRoutes = require('./routes/admin');
const orderRoutes = require('./routes/order');

const app = express();

// --- Cấu hình View Engine ---
app.set('view engine', 'ejs');

// --- Middlewares ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Dùng cho form HTML


// --- Authentication cho Admin ---
const adminUser = { [config.admin.user]: config.admin.password };
const authMiddleware = basicAuth({
    users: adminUser,
    challenge: true,
    unauthorizedResponse: 'Unauthorized access. Please login to view the admin dashboard.'
});

// --- Sử dụng Routes ---
// Tất cả các request tới /admin/* sẽ đi qua middleware xác thực rồi mới tới adminRoutes
app.use('/admin', authMiddleware, adminRoutes);
// Tất cả các request tới /api/* sẽ được xử lý bởi orderRoutes
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
        app.listen(config.server.port, () => {
            console.log(`\n🎉 Server started successfully!`);
            console.log(`   - API is running on http://localhost:${config.server.port}`);
            console.log(`   - Admin Dashboard is available at http://localhost:${config.server.port}/admin/dashboard`);
        });
    } else {
        console.error('\n❌ Failed to start server due to one or more connection errors.');
        console.log('   Please check the logs above and ensure all services are running correctly.');
        process.exit(1);
    }
}

// Chạy hàm khởi động
startServer();