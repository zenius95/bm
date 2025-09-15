// controllers/userController.js
const User = require('../models/User');
const CrudService = require('../utils/crudService');
const createCrudController = require('./crudController');

// 1. Khởi tạo Service cho User
const userService = new CrudService(User, {
    // === START: CẬP NHẬT TRƯỜNG TÌM KIẾM ===
    searchableFields: ['username', 'email']
    // === END: CẬP NHẬT TRƯỜNG TÌM KIẾM ===
});

// 2. Tạo Controller từ Factory
const userController = createCrudController(userService, 'users', {
    single: 'user',
    plural: 'users'
});

// 3. Ghi đè lại các hàm cần xử lý đặc biệt (như mật khẩu, email)
userController.handleCreate = async (req, res) => {
    try {
        // === START: THÊM EMAIL VÀ VALIDATION ===
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
        // === END: THÊM EMAIL VÀ VALIDATION ===

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
        // === START: THÊM EMAIL ===
        const { username, email, password, role, balance } = req.body;
        // === END: THÊM EMAIL ===

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy user.' });
        }

        // === START: CẬP NHẬT VALIDATION CHO USERNAME VÀ EMAIL ===
        if (username.toLowerCase() !== user.username) {
            const existingUser = await User.findOne({ username: username.toLowerCase() });
            if (existingUser) {
                return res.status(400).json({ success: false, message: "Username đã tồn tại." });
            }
        }
        if (email.toLowerCase() !== user.email) {
            const existingEmail = await User.findOne({ email: email.toLowerCase() });
            if (existingEmail) {
                return res.status(400).json({ success: false, message: "Email đã tồn tại." });
            }
        }

        user.username = username;
        user.email = email;
        user.role = role;
        user.balance = balance;
        // === END: CẬP NHẬT VALIDATION CHO USERNAME VÀ EMAIL ===

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