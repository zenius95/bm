// controllers/userController.js
const User = require('../models/User');
const CrudService = require('../utils/crudService');
const createCrudController = require('./crudController');

// 1. Khởi tạo Service cho User
const userService = new CrudService(User, {
    searchableFields: ['username']
});

// 2. Tạo Controller từ Factory
const userController = createCrudController(userService, 'users', {
    single: 'user',
    plural: 'users'
});

// 3. Ghi đè lại các hàm cần xử lý đặc biệt (như mật khẩu)
userController.handleCreate = async (req, res) => {
    try {
        const { username, password, role, balance } = req.body;
        if (!username || !password) {
             return res.status(400).json({ success: false, message: "Username và Password là bắt buộc." });
        }
        
        const existingUser = await User.findOne({ username: username.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({ success: false, message: "Username đã tồn tại." });
        }

        const newUser = new User({
            username,
            password,
            role,
            balance: balance || 0
        });

        await newUser.save();
        return res.json({ success: true, message: `Đã tạo thành công user ${username}.` });
    } catch (error) {
        console.error("Error creating user from admin:", error);
        return res.status(500).json({ success: false, message: "Lỗi server khi tạo user." });
    }
};

userController.handleUpdate = async (req, res) => {
    try {
        const { id } = req.params;
        const { username, password, role, balance } = req.body;

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy user.' });
        }

        // Kiểm tra trùng username (nếu username bị thay đổi)
        if (username.toLowerCase() !== user.username) {
            const existingUser = await User.findOne({ username: username.toLowerCase() });
            if (existingUser) {
                return res.status(400).json({ success: false, message: "Username đã tồn tại." });
            }
        }

        user.username = username;
        user.role = role;
        user.balance = balance;

        // Chỉ cập nhật mật khẩu nếu người dùng nhập mật khẩu mới
        if (password) {
            user.password = password;
        }

        await user.save();
        return res.json({ success: true, message: `Cập nhật user ${username} thành công.` });
    } catch (error) {
        console.error(`Error updating user ${req.params.id}:`, error);
        return res.status(500).json({ success: false, message: 'Lỗi server khi cập nhật user.' });
    }
};

module.exports = userController;