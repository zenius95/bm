// controllers/userController.js
const User = require('../models/User');
const CrudService = require('../utils/crudService');
const createCrudController = require('./crudController');
const { logActivity } = require('../utils/activityLogService');

const userService = new CrudService(User, { searchableFields: ['username', 'email'] });
const userController = createCrudController(userService, 'users', { single: 'user', plural: 'users' });

userController.handleCreate = async (req, res) => {
    try {
        const { username, email, password, role, balance } = req.body;
        // ... (validation logic)
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
        
        let logDetails = [];

        // ... (update logic for username, email, role, password)
        if (username.toLowerCase() !== user.username) {
            const existingUser = await User.findOne({ username: username.toLowerCase() });
            if (existingUser) return res.status(400).json({ success: false, message: "Username đã tồn tại." });
            logDetails.push(`username từ '${user.username}' thành '${username}'`);
            user.username = username;
        }
        if (email.toLowerCase() !== user.email) {
            const existingEmail = await User.findOne({ email: email.toLowerCase() });
            if (existingEmail) return res.status(400).json({ success: false, message: "Email đã tồn tại." });
            logDetails.push(`email`);
            user.email = email;
        }
        if(role !== user.role) {
            logDetails.push(`role từ '${user.role}' thành '${role}'`);
            user.role = role;
        }
        if (password) {
            logDetails.push(`mật khẩu`);
            user.password = password;
        }

        const adjustmentAmount = parseInt(balanceAdjustment, 10);
        if (!isNaN(adjustmentAmount) && adjustmentAmount !== 0) {
            const originalBalance = user.balance;
            user.balance += adjustmentAmount;
            if (user.balance < 0) {
                return res.status(400).json({ success: false, message: 'Số dư không thể là số âm.' });
            }
            await logActivity(adminUserId, 'ADMIN_ADJUST_BALANCE', { 
                details: `Admin '${adminUsername}' đã ${adjustmentAmount > 0 ? 'cộng' : 'trừ'} ${Math.abs(adjustmentAmount).toLocaleString('vi-VN')}đ cho '${user.username}'. Số dư: ${originalBalance.toLocaleString('vi-VN')}đ -> ${user.balance.toLocaleString('vi-VN')}đ.`,
                ipAddress, 
                context: 'Admin' 
            });
        }
        
        if (logDetails.length > 0) {
             await logActivity(adminUserId, 'ADMIN_UPDATE_USER', { 
                details: `Admin '${adminUsername}' đã cập nhật ${logDetails.join(', ')} của user '${user.username}'.`,
                ipAddress, 
                context: 'Admin' 
            });
        }

        await user.save();
        return res.json({ success: true, message: `Cập nhật user ${user.username} thành công.` });
    } catch (error) {
        console.error(`Error updating user ${req.params.id}:`, error);
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