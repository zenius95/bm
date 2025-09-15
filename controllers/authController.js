// controllers/authController.js
const User = require('../models/User');
const { logActivity } = require('../utils/activityLogService');

const authController = {};

authController.getLoginPage = (req, res) => {
    res.render('client/login', { layout: false, error: req.query.error });
};

authController.login = async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username: username.toLowerCase(), isDeleted: false });

        if (!user || !(await user.comparePassword(password))) {
            return res.redirect('/login?error=' + encodeURIComponent('Sai tên đăng nhập hoặc mật khẩu.'));
        }
        
        req.session.user = {
            id: user._id,
            username: user.username,
            role: user.role
        };
        
        const ipAddress = req.ip || req.connection.remoteAddress;
        await logActivity(user._id, 'USER_LOGIN', {
            details: `Người dùng '${user.username}' đã đăng nhập.`,
            ipAddress,
            context: user.role === 'admin' ? 'Admin' : 'Client'
        });
        
        if (user.role === 'admin') {
            res.redirect('/admin/dashboard');
        } else {
            res.redirect('/dashboard');
        }
    } catch (error) {
        console.error("Login error:", error);
        res.redirect('/login?error=' + encodeURIComponent('Lỗi server.'));
    }
};

authController.logout = (req, res) => {
    if (req.session.user) {
        const ipAddress = req.ip || req.connection.remoteAddress;
        logActivity(req.session.user.id, 'USER_LOGOUT', {
            details: `Người dùng '${req.session.user.username}' đã đăng xuất.`,
            ipAddress,
            context: req.session.user.role === 'admin' ? 'Admin' : 'Client'
        });
    }
    req.session.destroy(err => {
        if (err) { return res.redirect('/login'); }
        res.clearCookie('connect.sid');
        res.redirect('/login');
    });
};

authController.isAuthenticated = (req, res, next) => {
    if (req.session && req.session.user) { return next(); }
    res.redirect('/login');
};

authController.isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') { return next(); }
    res.status(403).send('Forbidden: You do not have permission to access this page.');
};

module.exports = authController;