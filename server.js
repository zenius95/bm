// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const basicAuth = require('express-basic-auth');
const config = require('./config');
const path = require('path');
const os = require('os-utils');
const Worker = require('./models/Worker');
const workerMonitor = require('./utils/workerMonitor');

const adminRoutes = require('./routes/admin');
const orderRoutes = require('./routes/order');
const autoCheckManager = require('./utils/autoCheckManager');
const itemProcessorManager = require('./utils/itemProcessorManager');
const settingsService = require('./utils/settingsService');

const app = express();
const http = require('http');
const { Server } = require("socket.io");
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// --- Cấu hình View Engine ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '/views'));

// --- Middlewares ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
    req.io = io;
    next();
});

// --- Authentication cho Admin ---
const adminUser = { [config.admin.user]: config.admin.password };
const authMiddleware = basicAuth({
    users: adminUser,
    challenge: true,
    unauthorizedResponse: 'Unauthorized access.'
});

// --- Sử dụng Routes ---
app.use('/admin', authMiddleware, adminRoutes);
// === START: THAY ĐỔI QUAN TRỌNG ===
// Áp dụng auth cho cả API routes để bảo mật và đồng bộ
app.use('/api', authMiddleware, orderRoutes);
// === END: THAY ĐỔI QUAN TRỌNG ===


// --- Hàm khởi động chính ---
async function startServer() {
    console.log('🚀 Starting server, checking connections...');
    
    await settingsService.initialize();
    
    await mongoose.connect(config.mongodb.uri)
        .then(() => console.log('✅ MongoDB connection: OK'))
        .catch(err => {
            console.error('❌ MongoDB connection: FAILED', err);
            process.exit(1);
        });

    // Khởi tạo worker cục bộ
    await Worker.initializeLocalWorker();

    server.listen(config.server.port, () => {
        console.log(`\n🎉 Server started successfully!`);
        console.log(`   - API is running on http://localhost:${config.server.port}`);
        console.log(`   - Admin Dashboard is available at http://localhost:${config.server.port}/admin/dashboard`);
        
        // Khởi tạo các manager
        autoCheckManager.initialize(io);
        itemProcessorManager.initialize(io);
        workerMonitor.initialize(io); // Khởi động trạm giám sát
    });
}

startServer();