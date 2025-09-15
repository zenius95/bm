// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const config = require('./config');
const path = require('path');
const http = require('http');
const { Server } = require("socket.io");
const session = require('express-session');
const MongoStore = require('connect-mongo');
const expressLayouts = require('express-ejs-layouts');

const User = require('./models/User');
const Worker = require('./models/Worker');
const authController = require('./controllers/authController');
const apiKeyAuthController = require('./controllers/apiKeyAuthController');

const adminRoutes = require('./routes/admin');
const clientRoutes = require('./routes/client');
const orderRoutes = require('./routes/order');
const workerApiRoutes = require('./routes/workerApi');

const autoCheckManager = require('./utils/autoCheckManager');
const itemProcessorManager = require('./utils/itemProcessorManager');
const settingsService = require('./utils/settingsService');
const workerMonitor = require('./utils/workerMonitor');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '/views'));
app.use(expressLayouts);
app.set('layout', 'layouts/main');

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

app.use(async (req, res, next) => {
    req.io = io;
    res.locals.user = null;
    res.locals.currentPath = req.originalUrl; 
    if (req.session.user) {
        try {
            const currentUser = await User.findById(req.session.user.id).lean();
            if (currentUser) {
                res.locals.user = currentUser;
            } else {
                req.session.destroy();
            }
        } catch (error) {
            console.error("Lỗi khi lấy thông tin user cho session:", error);
        }
    }
    next();
});

// --- Các route không cần session ---
app.get('/login', authController.getLoginPage);
app.post('/login', authController.login);
app.get('/logout', authController.logout);

// === START: SỬA LỖI THỨ TỰ ROUTE ===
// Route cho worker API (dùng API Key) phải được đặt trước các route dùng session.
app.use('/worker-api', apiKeyAuthController, workerApiRoutes);

// --- Các route cần session ---
// Route cho admin (cần session và quyền admin)
app.use('/admin', authController.isAuthenticated, authController.isAdmin, adminRoutes);
// Route cho client (cần session)
app.use('/', authController.isAuthenticated, clientRoutes);
// Route cho API chung (cần session)
app.use('/api', authController.isAuthenticated, orderRoutes);
// === END ===


async function startServer() {
    console.log('🚀 Starting server, checking connections...');
    
    await settingsService.initialize();
    
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
                email: 'admin@example.com',
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