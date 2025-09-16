// controllers/clientController.js
const User = require('../models/User');
const Order = require('../models/Order');
const settingsService = require('../utils/settingsService');
const { logActivity } = require('../utils/activityLogService');

const clientController = {};

// Hiển thị trang dashboard chính của client
clientController.getDashboard = (req, res) => {
    const stats = {
        orders: 0, 
        pending: 0,
        balance: res.locals.user.balance 
    };
    res.render('client/dashboard', { 
        page: 'dashboard',
        stats,
        title: 'Client Dashboard'
    });
};

// Hiển thị trang chỉnh sửa thông tin
clientController.getProfilePage = (req, res) => {
    res.render('client/profile', {
        page: 'profile',
        title: 'Thông tin cá nhân',
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
        if (email && email.toLowerCase() !== user.email) {
            const existingEmail = await User.findOne({ email: email.toLowerCase() });
            if (existingEmail) {
                return res.redirect('/profile?error=' + encodeURIComponent('Email này đã được sử dụng.'));
            }
            user.email = email;
            hasChanges = true;
        }

        if (password) {
            if (password !== passwordConfirm) {
                return res.redirect('/profile?error=' + encodeURIComponent('Mật khẩu xác nhận không khớp.'));
            }
            user.password = password;
            hasChanges = true;
        }

        if (hasChanges) {
            await user.save();
            const ipAddress = req.ip || req.connection.remoteAddress;
            await logActivity(userId, 'PROFILE_UPDATE', {
                details: `Người dùng '${user.username}' đã tự cập nhật thông tin.`,
                ipAddress,
                context: 'Client'
            });
            return res.redirect('/profile?success=' + encodeURIComponent('Cập nhật thông tin thành công!'));
        }

        return res.redirect('/profile');
    } catch (error) {
        console.error("Lỗi cập nhật profile:", error);
        res.redirect('/profile?error=' + encodeURIComponent('Đã có lỗi xảy ra.'));
    }
};

// === START: THÊM CÁC HÀM MỚI ===

// Hiển thị trang tạo đơn hàng
clientController.getCreateOrderPage = (req, res) => {
    res.render('client/create-order', {
        page: 'create-order',
        title: 'Tạo Đơn Hàng Mới',
        pricePerItem: settingsService.get('order').pricePerItem,
        error: req.query.error
    });
};

// Xử lý tạo đơn hàng
clientController.postCreateOrder = async (req, res) => {
    try {
        const { itemsData } = req.body;
        const userId = req.session.user.id;
        const user = await User.findById(userId);

        if (!itemsData || itemsData.trim() === '') {
            return res.redirect('/create-order?error=' + encodeURIComponent('Vui lòng nhập ít nhất một item.'));
        }

        const items = itemsData.trim().split('\n').filter(line => line.trim() !== '').map(line => ({ data: line.trim(), status: 'queued' }));
        if (items.length === 0) {
            return res.redirect('/create-order?error=' + encodeURIComponent('Không có item nào hợp lệ.'));
        }
        
        const pricePerItem = settingsService.get('order').pricePerItem;
        const totalCost = items.length * pricePerItem;

        if (user.balance < totalCost) {
            return res.redirect('/create-order?error=' + encodeURIComponent('Số dư không đủ.'));
        }

        user.balance -= totalCost;
        await user.save();

        const newOrder = new Order({ user: userId, items, totalCost, pricePerItem });
        await newOrder.save();
        
        // Gửi sự kiện cập nhật dashboard
        const [ totalOrderCount, processingOrderCount ] = await Promise.all([
             Order.countDocuments({ isDeleted: false }),
             Order.countDocuments({ status: { $in: ['pending', 'processing'] }, isDeleted: false })
        ]);
        req.io.emit('dashboard:stats:update', { 
            orderStats: { total: totalOrderCount, processing: processingOrderCount }
        });

        res.redirect(`/orders/${newOrder._id}`);
    } catch (error) {
        console.error("Client order creation error:", error);
        res.redirect('/create-order?error=' + encodeURIComponent('Lỗi server, không thể tạo đơn hàng.'));
    }
};

// Hiển thị danh sách đơn hàng
clientController.getOrderListPage = async (req, res) => {
    const pageNum = parseInt(req.query.page, 10) || 1;
    const limit = 20;

    const query = { user: req.session.user.id, isDeleted: false };
    
    const totalItems = await Order.countDocuments(query);
    const orders = await Order.find(query)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limit)
        .limit(limit)
        .lean();

    orders.forEach(order => {
        order.completedItems = order.items.filter(item => item.status === 'completed').length;
        order.failedItems = order.items.filter(item => item.status === 'failed').length;
    });

    res.render('client/orders', {
        page: 'orders',
        title: 'Lịch Sử Đơn Hàng',
        orders,
        pagination: {
            totalItems,
            currentPage: pageNum,
            totalPages: Math.ceil(totalItems / limit),
        }
    });
};

// Hiển thị chi tiết một đơn hàng
clientController.getOrderDetailPage = async (req, res) => {
    try {
        const order = await Order.findOne({
            _id: req.params.id,
            user: req.session.user.id // Đảm bảo client chỉ xem được đơn hàng của mình
        }).lean();

        if (!order) {
            return res.status(404).send('Không tìm thấy đơn hàng.');
        }

        res.render('client/order-detail', {
            page: 'orders',
            title: `Chi Tiết Đơn Hàng #${order._id.toString().slice(-6)}`,
            order
        });
    } catch (error) {
        console.error("Client get order detail error:", error);
        res.status(500).send('Lỗi server.');
    }
};

// Hiển thị trang nạp tiền

clientController.getDepositPage = (req, res) => {
    // Tạo nội dung chuyển khoản duy nhất cho người dùng
    const transferContent = `NAPTIEN ${req.session.user.username.toUpperCase()}`;
    res.render('client/deposit', {
        page: 'deposit',
        title: 'Nạp tiền vào tài khoản',
        transferContent
    });
};

// === END ===

module.exports = clientController;