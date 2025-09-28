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

const settingsService = require('./utils/settingsService');


const User = require('./models/User');
const Worker = require('./models/Worker');
const Account = require('./models/Account');
const Proxy = require('./models/Proxy');
const Item = require('./models/Item');
const authController = require('./controllers/authController');
const apiKeyAuthController = require('./controllers/apiKeyAuthController');

const adminRoutes = require('./routes/admin');
const clientRoutes = require('./routes/client');
const orderRoutes = require('./routes/order');
const workerApiRoutes = require('./routes/workerApi');

const autoCheckManager = require('./utils/autoCheckManager');
const itemProcessorManager = require('./utils/itemProcessorManager');
const workerMonitor = require('./utils/workerMonitor');
const autoDepositManager = require('./utils/autoDepositManager');
const autoProxyCheckManager = require('./utils/autoProxyCheckManager');
const autoPhoneManager = require('./utils/autoPhoneManager'); // <<< THÊM DÒNG NÀY

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

io.on('connection', (socket) => {
    socket.on('join_room', (roomName) => {
        if (roomName) {
            socket.join(roomName);
        }
    });
    socket.on('leave_room', (roomName) => {
        if (roomName) {
            socket.leave(roomName);
        }
    });
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '/views'));
app.use(expressLayouts);
app.set('layout', 'layouts/main');

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use(express.static(path.join(__dirname, 'public')));

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

app.get('/login', authController.getLoginPage);
app.post('/login', authController.login);
app.get('/logout', authController.logout);
app.get('/register', authController.getRegisterPage);
app.post('/register', authController.register);

app.use('/worker-api', apiKeyAuthController, workerApiRoutes);

app.use('/admin', authController.isAuthenticated, authController.isAdmin, adminRoutes);
app.use('/', authController.isAuthenticated, clientRoutes);
app.use('/api', authController.isAuthenticated, orderRoutes);

async function cleanupOnStartup() {
    try {
        console.log('🧹 Bắt đầu dọn dẹp trạng thái các mục bị kẹt...');
        const stuckAccounts = await Account.find({ status: 'CHECKING' }).lean();
        if (stuckAccounts.length > 0) {
            const bulkOpsAccounts = stuckAccounts.map(acc => ({
                updateOne: {
                    filter: { _id: acc._id },
                    update: { $set: { status: acc.previousStatus || 'UNCHECKED', previousStatus: null } }
                }
            }));
            const accountRes = await Account.bulkWrite(bulkOpsAccounts);
            console.log(`- Đã khôi phục trạng thái cho ${accountRes.modifiedCount} accounts.`);
        }
        const stuckProxies = await Proxy.find({ status: 'CHECKING' }).lean();
        if (stuckProxies.length > 0) {
            const bulkOpsProxies = stuckProxies.map(proxy => ({
                updateOne: {
                    filter: { _id: proxy._id },
                    update: { $set: { status: proxy.previousStatus || 'UNCHECKED', previousStatus: null } }
                }
            }));
            const proxyRes = await Proxy.bulkWrite(bulkOpsProxies);
            console.log(`- Đã khôi phục trạng thái cho ${proxyRes.modifiedCount} proxies.`);
        }
        const itemRes = await Item.updateMany(
            { status: 'processing' },
            { $set: { status: 'queued' } }
        );
        if (itemRes.modifiedCount > 0) {
            console.log(`- Đã trả ${itemRes.modifiedCount} items về hàng đợi (queued).`);
        }
        console.log('✅ Dọn dẹp hoàn tất.');
    } catch (error) {
        console.error('❌ Lỗi trong quá trình dọn dẹp khi khởi động:', error);
    }
}

async function startServer() {
    console.log('🚀 Starting server, checking connections...');
    
    await settingsService.initialize();

    await mongoose.connect(config.mongodb.uri)
        .then(() => console.log('✅ MongoDB connection: OK'))
        .catch(err => {
            console.error('❌ MongoDB connection: FAILED', err);
            process.exit(1);
        });

    await cleanupOnStartup();

    console.log('🔧 Disabling all auto-services on startup...');
    await settingsService.update('autoCheck', { isEnabled: false });
    await settingsService.update('autoProxyCheck', { isEnabled: false });
    await settingsService.update('autoDeposit', { isEnabled: false });
    await settingsService.update('autoPhone', { isEnabled: false }); // <<< THÊM DÒNG NÀY
    console.log('✅ All auto-services have been disabled.');
    
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
        console.log(`   - Admin Dashboard is available at http://localhost:${config.server.port}/admin`);
        
        autoCheckManager.initialize(io);
        itemProcessorManager.initialize(io);
        workerMonitor.initialize(io);
        autoDepositManager.initialize(io);
        autoProxyCheckManager.initialize(io);
        autoPhoneManager.initialize(io); // <<< THÊM DÒNG NÀY
    });
}

startServer();