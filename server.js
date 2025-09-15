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

const User = require('./models/User');
const authController = require('./controllers/authController');
const apiKeyAuthController = require('./controllers/apiKeyAuthController'); // Thêm dòng này

const Worker = require('./models/Worker');
const workerMonitor = require('./utils/workerMonitor');
const adminRoutes = require('./routes/admin');
const orderRoutes = require('./routes/order');
const workerApiRoutes = require('./routes/workerApi'); // Thêm dòng này
const autoCheckManager = require('./utils/autoCheckManager');
const itemProcessorManager = require('./utils/itemProcessorManager');
const settingsService = require('./utils/settingsService');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '/views'));

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

app.use((req, res, next) => {
    req.io = io;
    res.locals.user = req.session.user;
    next();
});

app.get('/login', authController.getLoginPage);
app.post('/login', authController.login);
app.get('/logout', authController.logout);

// Route cho người dùng đã đăng nhập
app.use('/api', authController.isAuthenticated, orderRoutes);
// Route cho admin đã đăng nhập
app.use('/admin', authController.isAuthenticated, authController.isAdmin, adminRoutes);
// === START: ROUTE MỚI CHO WORKER ===
app.use('/worker-api', apiKeyAuthController, workerApiRoutes);
// === END: ROUTE MỚI CHO WORKER ===

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