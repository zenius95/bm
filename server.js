// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const basicAuth = require('express-basic-auth');
const config = require('./config');
const path = require('path');

const adminRoutes = require('./routes/admin');
const orderRoutes = require('./routes/order');
const autoCheckManager = require('./utils/autoCheckManager');
const settingsService = require('./utils/settingsService'); // THÊM DÒNG NÀY

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
app.use('/api', orderRoutes);


// --- Hàm khởi động chính ---
async function startServer() {
    console.log('🚀 Starting server, checking connections...');
    
    // === START: THAY ĐỔI QUAN TRỌNG ===
    // Khởi tạo settingsService TRƯỚC khi làm mọi việc khác
    await settingsService.initialize();
    // === END: THAY ĐỔI QUAN TRỌNG ===
    
    await mongoose.connect(config.mongodb.uri)
        .then(() => console.log('✅ MongoDB connection: OK'))
        .catch(err => {
            console.error('❌ MongoDB connection: FAILED', err);
            process.exit(1);
        });

    server.listen(config.server.port, () => {
        console.log(`\n🎉 Server started successfully!`);
        console.log(`   - API is running on http://localhost:${config.server.port}`);
        console.log(`   - Admin Dashboard is available at http://localhost:${config.server.port}/admin/dashboard`);
        
        // autoCheckManager giờ sẽ được khởi tạo với config đã được load sẵn
        autoCheckManager.initialize(io);
    });
}

startServer();