// controllers/userController.js
const User = require('../models/User');
const CrudService = require('../utils/crudService');
const createCrudController = require('./crudController');
const { logActivity } = require('../utils/activityLogService'); // === THÊM DÒNG NÀY ===

// 1. Khởi tạo Service cho User
const userService = new CrudService(User, {
    searchableFields: ['username', 'email']
});

// 2. Tạo Controller từ Factory
const userController = createCrudController(userService, 'users', {
    single: 'user',
    plural: 'users'
});

// 3. Ghi đè lại các hàm cần xử lý đặc biệt
userController.handleCreate = async (req, res) => {
    try {
        const { username, email, password, role, balance } = req.body;
        if (!username || !password || !email) {
             return res.status(400).json({ success: false, message: "Username, Email và Password là bắt buộc." });
        }
        
        const existingUser = await User.findOne({ $or: [{ username: username.toLowerCase() }, { email: email.toLowerCase() }] });
        if (existingUser) {
            if (existingUser.username === username.toLowerCase()) {
                return res.status(400).json({ success: false, message: "Username đã tồn tại." });
            }
            return res.status(400).json({ success: false, message: "Email đã tồn tại." });
        }

        const newUser = new User({
            username,
            email,
            password,
            role,
            balance: balance || 0
        });

        await newUser.save();
        
        // Ghi log tạo user mới
        const ipAddress = req.ip || req.connection.remoteAddress;
        await logActivity(req.session.user.id, 'ADMIN_CREATE_USER', {
            details: `Admin '${req.session.user.username}' đã tạo người dùng mới: '${newUser.username}'.`,
            ipAddress,
            context: 'Admin'
        });

        return res.json({ success: true, message: `Đã tạo thành công user ${newUser.username}.` });
    } catch (error) {
        console.error("Error creating user from admin:", error);
        return res.status(500).json({ success: false, message: "Lỗi server khi tạo user." });
    }
};

userController.handleUpdate = async (req, res) => {
    try {
        const { id } = req.params;
        const { username, email, password, role, balance, balanceAdjustment } = req.body;
        const adminUserId = req.session.user.id;
        const adminUsername = req.session.user.username;
        const ipAddress = req.ip || req.connection.remoteAddress;

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy user.' });
        }

        const originalBalance = user.balance;
        let newBalance = originalBalance;
        const adjustmentAmount = parseInt(balanceAdjustment, 10);

        if (!isNaN(adjustmentAmount) && adjustmentAmount !== 0) {
            newBalance += adjustmentAmount;
            if (newBalance < 0) {
                return res.status(400).json({ success: false, message: 'Số dư không thể là số âm.' });
            }
            user.balance = newBalance;
            
            const actionType = adjustmentAmount > 0 ? 'Cộng tiền' : 'Trừ tiền';
            const details = `Admin '${adminUsername}' đã ${actionType.toLowerCase()} ${Math.abs(adjustmentAmount).toLocaleString('vi-VN')}đ cho người dùng '${user.username}'. Số dư thay đổi từ ${originalBalance.toLocaleString('vi-VN')}đ thành ${newBalance.toLocaleString('vi-VN')}đ.`;
            await logActivity(adminUserId, 'ADMIN_ADJUST_BALANCE', { 
                details, 
                ipAddress, 
                context: 'Admin' 
            });
        }

        if (username.toLowerCase() !== user.username) {
            const existingUser = await User.findOne({ username: username.toLowerCase() });
            if (existingUser) return res.status(400).json({ success: false, message: "Username đã tồn tại." });
            user.username = username;
        }
        if (email.toLowerCase() !== user.email) {
            const existingEmail = await User.findOne({ email: email.toLowerCase() });
            if (existingEmail) return res.status(400).json({ success: false, message: "Email đã tồn tại." });
            user.email = email;
        }
        user.role = role;

        if (password) {
            user.password = password;
        }

        await user.save();
        return res.json({ success: true, message: `Cập nhật user ${user.username} thành công.` });
    } catch (error) {
        console.error(`Error updating user ${req.params.id}:`, error);
        return res.status(500).json({ success: false, message: 'Lỗi server khi cập nhật user.' });
    }
};

module.exports = userController;