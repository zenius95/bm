// controllers/authController.js
const User = require('../models/User');

const authController = {};

// Hiển thị trang đăng nhập
authController.getLoginPage = (req, res) => {
    // === THAY ĐỔI Ở ĐÂY ===
    res.render('client/login', { layout: false, error: req.query.error });
};

// Xử lý đăng nhập
authController.login = async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username: username.toLowerCase(), isDeleted: false });

        if (!user || !(await user.comparePassword(password))) {
            // === THAY ĐỔI Ở ĐÂY: Truyền lỗi qua query string ===
            return res.redirect('/login?error=' + encodeURIComponent('Sai tên đăng nhập hoặc mật khẩu.'));
        }
        
        // === THAY ĐỔI Ở ĐÂY: Kiểm tra quyền admin ===
        if (user.role !== 'admin') {
            return res.redirect('/login?error=' + encodeURIComponent('Chỉ có quản trị viên mới được đăng nhập.'));
        }

        req.session.user = {
            id: user._id,
            username: user.username,
            role: user.role
        };

        res.redirect('/admin/dashboard');

    } catch (error) {
        console.error("Login error:", error);
        res.redirect('/login?error=' + encodeURIComponent('Lỗi server.'));
    }
};

// Đăng xuất
authController.logout = (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.redirect('/admin/dashboard');
        }
        res.clearCookie('connect.sid');
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
    res.status(403).send('Forbidden: Admins only');
};

module.exports = authController;