// controllers/authController.js
const User = require('../models/User');

const authController = {};

// Hiển thị trang đăng nhập
authController.getLoginPage = (req, res) => {
    res.render('login', { layout: false }); // layout: false để không dùng sidebar, header
};

// Xử lý đăng nhập
authController.login = async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username: username.toLowerCase(), isDeleted: false });

        if (!user) {
            return res.redirect('/login?error=Invalid credentials');
        }

        const isMatch = await user.comparePassword(password);

        if (!isMatch) {
            return res.redirect('/login?error=Invalid credentials');
        }

        // Lưu thông tin user vào session
        req.session.user = {
            id: user._id,
            username: user.username,
            role: user.role
        };

        res.redirect('/admin/dashboard');

    } catch (error) {
        console.error("Login error:", error);
        res.redirect('/login?error=Server error');
    }
};

// Đăng xuất
authController.logout = (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.redirect('/admin/dashboard');
        }
        res.clearCookie('connect.sid'); // Tên cookie mặc định của express-session
        res.redirect('/login');
    });
};

// Middleware kiểm tra đã đăng nhập chưa
authController.isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    }
    res.redirect('/login');
};

// Middleware kiểm tra có phải Admin không
authController.isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') {
        return next();
    }
    // Có thể chuyển hướng đến trang báo lỗi "không có quyền"
    res.status(403).send('Forbidden: Admins only');
};


module.exports = authController;