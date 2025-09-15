// controllers/authController.js
const User = require('../models/User');
const { logActivity } = require('../utils/activityLogService'); // Thêm dòng này


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
        
        req.session.user = {
            id: user._id,
            username: user.username,
            role: user.role
        };

        const ipAddress = req.ip || req.connection.remoteAddress;
        await logActivity(user._id, 'USER_LOGIN', `Người dùng '${user.username}' đã đăng nhập thành công.`, ipAddress);
        
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

// Đăng xuất
authController.logout = (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.redirect('/login');
        }
        res.clearCookie('connect.sid');
        res.redirect('/login');
    });
};

// Middleware kiểm tra đã đăng nhập chưa
authController.isAuthenticated = (req, res, next) => {
    if (req.session && req.session.user) {
        return next();
    }
    res.redirect('/login');
};

// === START: SỬA LẠI MIDDLEWARE ISADMIN ===
// Middleware này chỉ kiểm tra quyền truy cập vào các route /admin
authController.isAdmin = (req, res, next) => {
    // Nếu đã đăng nhập và là admin, cho phép đi tiếp
    if (req.session.user && req.session.user.role === 'admin') {
        return next();
    }
    // Nếu không phải admin (là user thường), trả về lỗi 403 Forbidden
    // và không cho phép truy cập.
    res.status(403).send('Forbidden: You do not have permission to access this page.');
};
// === END ===

module.exports = authController;