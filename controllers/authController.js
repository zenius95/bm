// controllers/authController.js

const User = require('../models/User');
const { logActivity } = require('../utils/activityLogService');

const authController = {};
const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/; // Biến dùng chung

authController.getLoginPage = (req, res) => {
    res.render('client/login', { layout: false, error: req.query.error, success: req.query.success });
};

authController.getRegisterPage = (req, res) => {
    res.render('client/register', { layout: false, error: req.query.error });
};

authController.register = async (req, res) => {
    try {
        const { username, email, password, passwordConfirm } = req.body;

        if (!username || !email || !password || !passwordConfirm) {
            return res.redirect('/register?error=' + encodeURIComponent('Vui lòng điền đầy đủ thông tin.'));
        }
        
        // === START: THÊM KIỂM TRA USERNAME ===
        if (!USERNAME_REGEX.test(username)) {
            return res.redirect('/register?error=' + encodeURIComponent('Username chỉ được chứa chữ cái, số và dấu gạch dưới (_).'));
        }
        // === END: THÊM KIỂM TRA USERNAME ===

        if (password !== passwordConfirm) {
            return res.redirect('/register?error=' + encodeURIComponent('Mật khẩu xác nhận không khớp.'));
        }

        const existingUser = await User.findOne({ 
            $or: [{ username: username.toLowerCase() }, { email: email.toLowerCase() }] 
        });
        if (existingUser) {
            return res.redirect('/register?error=' + encodeURIComponent('Username hoặc Email đã tồn tại.'));
        }

        const newUser = new User({ username, email, password });
        await newUser.save();
        
        const ipAddress = req.ip || req.connection.remoteAddress;
        await logActivity(newUser._id, 'USER_REGISTER', {
            details: `Tài khoản mới '${newUser.username}' đã được đăng ký.`,
            ipAddress,
            context: 'Client'
        });

        res.redirect('/login?success=' + encodeURIComponent('Đăng ký thành công! Vui lòng đăng nhập.'));
    } catch (error) {
        console.error("Register error:", error);
        // === START: HIỂN THỊ LỖI TỪ VALIDATOR ===
        if (error.errors && error.errors.username) {
             return res.redirect('/register?error=' + encodeURIComponent(error.errors.username.message));
        }
        // === END: HIỂN THỊ LỖI TỪ VALIDATOR ===
        res.redirect('/register?error=' + encodeURIComponent('Lỗi server, không thể đăng ký.'));
    }
};

authController.login = async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username: username.toLowerCase(), isDeleted: false });

        if (!user || !(await user.comparePassword(password))) {
            return res.redirect('/login?error=' + encodeURIComponent('Sai tên đăng nhập hoặc mật khẩu.'));
        }
        
        req.session.user = { id: user._id, username: user.username, role: user.role };
        
        const ipAddress = req.ip || req.connection.remoteAddress;
        await logActivity(user._id, 'USER_LOGIN', {
            details: `Người dùng '${user.username}' đã đăng nhập.`,
            ipAddress,
            context: user.role === 'admin' ? 'Admin' : 'Client'
        });
        
        res.redirect(user.role === 'admin' ? '/admin' : '/');
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