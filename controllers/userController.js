// controllers/userController.js

const User = require('../models/User');
const CrudService = require('../utils/crudService');
const createCrudController = require('./crudController');
const { logActivity } = require('../utils/activityLogService');

const userService = new CrudService(User, { searchableFields: ['username', 'email'] });
const userController = createCrudController(userService, 'users', { single: 'user', plural: 'users' });
const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/; // Biến dùng chung

userController.handleCreate = async (req, res) => {
    try {
        const { username, email, password, role, balance } = req.body;
        
        if (!username || !password || !email) {
             return res.status(400).json({ success: false, message: "Username, Email và Password là bắt buộc." });
        }
        
        if (!USERNAME_REGEX.test(username)) {
            return res.status(400).json({ success: false, message: 'Username chỉ được chứa chữ cái, số và dấu gạch dưới (_).' });
        }
        
        const existingUser = await User.findOne({ $or: [{ username: username.toLowerCase() }, { email: email.toLowerCase() }] });
        if (existingUser) {
            if (existingUser.username === username.toLowerCase()) {
                return res.status(400).json({ success: false, message: "Username đã tồn tại." });
            }
            return res.status(400).json({ success: false, message: "Email đã tồn tại." });
        }

        const newUser = new User({ username, email, password, role, balance: balance || 0 });
        await newUser.save();
        
        await logActivity(req.session.user.id, 'ADMIN_CREATE_USER', {
            details: `Admin '${req.session.user.username}' đã tạo người dùng mới: '${newUser.username}'.`,
            ipAddress: req.ip || req.connection.remoteAddress,
            context: 'Admin'
        });

        return res.json({ success: true, message: `Đã tạo thành công user ${newUser.username}.` });
    } catch (error) {
        console.error("Error creating user from admin:", error);
        if (error.errors && error.errors.username) {
            return res.status(400).json({ success: false, message: error.errors.username.message });
        }
        return res.status(500).json({ success: false, message: "Lỗi server khi tạo user." });
    }
};

userController.handleUpdate = async (req, res) => {
    try {
        const { id } = req.params;
        const { username, email, password, role, balanceAdjustment } = req.body;
        const adminUserId = req.session.user.id;
        const adminUsername = req.session.user.username;
        const ipAddress = req.ip || req.connection.remoteAddress;

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy user.' });
        }
        
        let logDetails = [];
        const balanceBefore = user.balance;

        if (username.toLowerCase() !== user.username) {
            if (!USERNAME_REGEX.test(username)) {
                return res.status(400).json({ success: false, message: 'Username chỉ được chứa chữ cái, số và dấu gạch dưới (_).' });
            }
            const existingUser = await User.findOne({ username: username.toLowerCase() });
            if (existingUser) return res.status(400).json({ success: false, message: "Username đã tồn tại." });
            logDetails.push(`username từ '${user.username}' thành '${username}'`);
            user.username = username;
        }

        if (email.toLowerCase() !== user.email) {
            const existingEmail = await User.findOne({ email: email.toLowerCase() });
            if (existingEmail) return res.status(400).json({ success: false, message: 'Email đã tồn tại.' });
            logDetails.push(`email từ '${user.email}' thành '${email}'`);
            user.email = email;
        }

        if (password) {
            logDetails.push('mật khẩu');
            user.password = password; // Mongoose's pre-save hook will hash it
        }

        if (role && role !== user.role) {
            logDetails.push(`vai trò từ '${user.role}' thành '${role}'`);
            user.role = role;
        }
        
        const adjustment = parseInt(balanceAdjustment, 10);
        if (!isNaN(adjustment) && adjustment !== 0) {
            const newBalance = user.balance + adjustment;
            user.balance = newBalance;
            
            // Log a specific activity for balance changes
            await logActivity(adminUserId, 'ADMIN_ADJUST_BALANCE', {
                details: `Admin '${adminUsername}' đã điều chỉnh số dư của '${user.username}'.`,
                ipAddress,
                context: 'Admin',
                metadata: {
                    balanceBefore: balanceBefore,
                    balanceAfter: newBalance,
                    change: adjustment,
                    targetUserId: user._id
                }
            });
        }

        // === START: SỬA LỖI - THÊM LỆNH SAVE ===
        await user.save();
        // === END: SỬA LỖI ===
        
        if (logDetails.length > 0) {
            await logActivity(adminUserId, 'ADMIN_UPDATE_USER', {
                details: `Admin '${adminUsername}' đã cập nhật thông tin cho user '${user.username}': thay đổi ${logDetails.join(', ')}.`,
                ipAddress,
                context: 'Admin'
            });
        }

        return res.json({ success: true, message: `Đã cập nhật thành công user ${user.username}.` });

    } catch (error) {
        console.error(`Error updating user ${req.params.id}:`, error);
        if (error.errors && error.errors.username) {
            return res.status(400).json({ success: false, message: error.errors.username.message });
        }
        return res.status(500).json({ success: false, message: 'Lỗi server khi cập nhật user.' });
    }
};

// Override handleHardDelete to add logging
const originalHardDelete = userController.handleHardDelete;
userController.handleHardDelete = async (req, res, next) => {
    try {
        const { ids, selectAll, filters } = req.body;
        let usersToDelete = [];
        if (selectAll) {
             const userIds = await userService.findAllIds(filters);
             usersToDelete = await User.find({ _id: { $in: userIds } }).lean();
        } else if (ids && ids.length > 0) {
            usersToDelete = await User.find({ _id: { $in: ids } }).lean();
        }

        await originalHardDelete(req, res, next);
        
        const deletedUsernames = usersToDelete.map(u => u.username).join(', ');
        if(deletedUsernames){
            await logActivity(req.session.user.id, 'ADMIN_DELETE_USER', {
                details: `Admin '${req.session.user.username}' đã xóa vĩnh viễn user: ${deletedUsernames}.`,
                ipAddress: req.ip || req.connection.remoteAddress,
                context: 'Admin'
            });
        }
    } catch(e){
        console.error(e)
        // Let original handler send response
    }
};

module.exports = userController;