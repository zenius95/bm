// controllers/clientController.js
const User = require('../models/User');
const bcrypt = require('bcryptjs');

const clientController = {};

// Hiển thị trang dashboard chính của client
clientController.getDashboard = (req, res) => {
    const stats = {
        orders: 0, // Dữ liệu mẫu
        pending: 0,
        balance: res.locals.user.balance 
    };
    res.render('client/dashboard', { 
        page: 'dashboard',
        stats,
        title: 'Client Dashboard'
    });
};

// === START: THÊM CÁC HÀM MỚI CHO PROFILE ===

// Hiển thị trang chỉnh sửa thông tin
clientController.getProfilePage = (req, res) => {
    res.render('client/profile', {
        page: 'profile',
        title: 'Thông tin cá nhân',
        // Truyền message từ query string nếu có
        success: req.query.success,
        error: req.query.error
    });
};

// Xử lý cập nhật thông tin
clientController.updateProfile = async (req, res) => {
    try {
        const { email, password, passwordConfirm } = req.body;
        const userId = req.session.user.id;

        const user = await User.findById(userId);
        if (!user) {
            return res.redirect('/profile?error=' + encodeURIComponent('Không tìm thấy người dùng.'));
        }

        let hasChanges = false;

        // 1. Cập nhật Email (nếu có thay đổi)
        if (email && email.toLowerCase() !== user.email) {
            // Kiểm tra email mới có bị trùng không
            const existingEmail = await User.findOne({ email: email.toLowerCase() });
            if (existingEmail) {
                return res.redirect('/profile?error=' + encodeURIComponent('Email này đã được sử dụng.'));
            }
            user.email = email;
            hasChanges = true;
        }

        // 2. Cập nhật Mật khẩu (nếu có nhập)
        if (password) {
            if (password !== passwordConfirm) {
                return res.redirect('/profile?error=' + encodeURIComponent('Mật khẩu xác nhận không khớp.'));
            }
            // Model User đã có middleware tự hash password trước khi save
            user.password = password;
            hasChanges = true;
        }

        if (hasChanges) {
            await user.save();

            // === GHI LOG CẬP NHẬT PROFILE ===
            const ipAddress = req.ip || req.connection.remoteAddress;
            await logActivity(userId, 'PROFILE_UPDATE', `Người dùng '${user.username}' đã cập nhật thông tin cá nhân.`, ipAddress);

            return res.redirect('/profile?success=' + encodeURIComponent('Cập nhật thông tin thành công!'));
        }

        return res.redirect('/profile');

    } catch (error) {
        console.error("Lỗi cập nhật profile:", error);
        res.redirect('/profile?error=' + encodeURIComponent('Đã có lỗi xảy ra.'));
    }
};
// === END ===

module.exports = clientController;