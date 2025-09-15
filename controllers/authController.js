// controllers/authController.js
const User = require('../models/User');

const authController = {};

// Hiển thị trang đăng nhập
authController.getLoginPage = (req, res) => {
    res.render('client/login', { layout: false, error: req.query.error });
};

// Xử lý đăng nhập
authController.login = async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username: username.toLowerCase(), isDeleted: false });

        if (!user || !(await user.comparePassword(password))) {
            return res.redirect('/login?error=' + encodeURIComponent('Sai tên đăng nhập hoặc mật khẩu.'));
        }
        
        // Lưu thông tin user vào session
        req.session.user = {
            id: user._id,
            username: user.username,
            role: user.role
        };
        
        // === START: PHÂN LUỒNG USER ===
        // Nếu là 'admin' thì vào trang admin, ngược lại vào trang client
        if (user.role === 'admin') {
            res.redirect('/admin/dashboard');
        } else {
            res.redirect('/dashboard'); // URL mới cho client
        }
        // === END: PHÂN LUỒNG USER ===

    } catch (error) {
        console.error("Login error:", error);
        res.redirect('/login?error=' + encodeURIComponent('Lỗi server.'));
    }
};

// Đăng xuất
authController.logout = (req, res) => {
    req.session.destroy(err => {
        if (err) {
            // Chuyển hướng về trang login sau khi logout
            return res.redirect('/login');
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
    // Nếu user thường cố vào trang admin, đá về dashboard của họ
    if (req.session.user) {
        return res.redirect('/dashboard');
    }
    // Nếu chưa đăng nhập, về trang login
    res.redirect('/login');
};

module.exports = authController;