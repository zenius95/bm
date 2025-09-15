// server.js
const express = require('express');
const expressLayouts = require('express-ejs-layouts'); // Thêm dòng này
const mongoose = require('mongoose');
const cors = require('cors');
const config = require('./config');
const path = require('path');
const http = require('http');
const { Server } = require("socket.io");
const session = require('express-session');
const MongoStore = require('connect-mongo');

const User = require('./models/User');
const authController = require('./controllers/authController');
const apiKeyAuthController = require('./controllers/apiKeyAuthController');

const Worker = require('./models/Worker');
const workerMonitor = require('./utils/workerMonitor');
const adminRoutes = require('./routes/admin');
const orderRoutes = require('./routes/order');
const workerApiRoutes = require('./routes/workerApi');
const autoCheckManager = require('./utils/autoCheckManager');
const itemProcessorManager = require('./utils/itemProcessorManager');
const settingsService = require('./utils/settingsService');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '/views'));

app.use(expressLayouts); // Thêm dòng này
app.set('layout', 'layouts/main'); // Đặt layout mặc định

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || 'a_very_strong_secret_key_12345',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: config.mongodb.uri }),
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60 * 24 
    }
}));

// === START: CẬP NHẬT MIDDLEWARE ===
// Middleware này sẽ lấy thông tin user mới nhất từ DB trên mỗi request
// để đảm bảo số dư và các thông tin khác luôn chính xác.
app.use(async (req, res, next) => {
    req.io = io;
    res.locals.user = null; // Khởi tạo user là null
    if (req.session.user) {
        try {
            const currentUser = await User.findById(req.session.user.id).lean();
            if (currentUser) {
                res.locals.user = currentUser;
            } else {
                // Nếu user không còn tồn tại trong DB, hủy session
                req.session.destroy();
            }
        } catch (error) {
            console.error("Lỗi khi lấy thông tin user cho session:", error);
        }
    }
    next();
});
// === END: CẬP NHẬT MIDDLEWARE ===

app.get('/login', authController.getLoginPage);
app.post('/login', authController.login);
app.get('/logout', authController.logout);

app.use('/api', authController.isAuthenticated, orderRoutes);
app.use('/admin', authController.isAuthenticated, authController.isAdmin, adminRoutes);
app.use('/worker-api', apiKeyAuthController, workerApiRoutes);

async function startServer() {
    console.log('🚀 Starting server, checking connections...');
    
    await settingsService.initialize();
    await settingsService.update('autoCheck', { isEnabled: false });
    console.log('[Server Startup] Auto Check Live process has been set to DISABLED.');
    
    await mongoose.connect(config.mongodb.uri)
        .then(() => console.log('✅ MongoDB connection: OK'))
        .catch(err => {
            console.error('❌ MongoDB connection: FAILED', err);
            process.exit(1);
        });

    const adminCount = await User.countDocuments({ role: 'admin' });
    if (adminCount === 0) {
        console.log('No admin user found. Creating default admin...');
        try {
            const defaultAdmin = new User({
                username: 'admin',
                password: 'admin',
                role: 'admin'
            });
            await defaultAdmin.save();
            console.log('✅ Default admin user (admin/admin) created successfully.');
        } catch (error) {
            console.error('❌ Failed to create default admin user:', error);
        }
    }

    await Worker.initializeLocalWorker();

    server.listen(config.server.port, () => {
        console.log(`\n🎉 Server started successfully!`);
        console.log(`   - API is running on http://localhost:${config.server.port}`);
        console.log(`   - Admin Dashboard is available at http://localhost:${config.server.port}/admin/dashboard`);
        
        autoCheckManager.initialize(io);
        itemProcessorManager.initialize(io);
        workerMonitor.initialize(io);
    });
}

startServer();