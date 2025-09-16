// controllers/clientController.js
const User = require('../models/User');
const Order = require('../models/Order');
const settingsService = require('../utils/settingsService');
const { logActivity } = require('../utils/activityLogService');

const clientController = {};

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

clientController.getProfilePage = (req, res) => {
    res.render('client/profile', {
        page: 'profile',
        title: 'Thông tin cá nhân',
        success: req.query.success,
        error: req.query.error
    });
};

clientController.updateProfile = async (req, res) => {
    try {
        const { email, password, passwordConfirm } = req.body;
        const userId = req.session.user.id;
        const user = await User.findById(userId);

        if (!user) {
            return res.redirect('/profile?error=' + encodeURIComponent('Không tìm thấy người dùng.'));
        }

        let changes = [];
        if (email && email.toLowerCase() !== user.email) {
            const existingEmail = await User.findOne({ email: email.toLowerCase() });
            if (existingEmail) {
                return res.redirect('/profile?error=' + encodeURIComponent('Email này đã được sử dụng.'));
            }
            user.email = email;
            changes.push('email');
        }

        if (password) {
            if (password !== passwordConfirm) {
                return res.redirect('/profile?error=' + encodeURIComponent('Mật khẩu xác nhận không khớp.'));
            }
            user.password = password;
            changes.push('mật khẩu');
        }

        if (changes.length > 0) {
            await user.save();
            await logActivity(userId, 'PROFILE_UPDATE', {
                details: `Người dùng '${user.username}' đã tự cập nhật ${changes.join(' và ')}.`,
                ipAddress: req.ip || req.connection.remoteAddress,
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

// === START: CẬP NHẬT ĐỂ TRUYỀN DỮ LIỆU BẬC GIÁ ===
clientController.getCreateOrderPage = (req, res) => {
    res.render('client/create-order', {
        page: 'create-order',
        title: 'Tạo Đơn Hàng Mới',
        pricingTiers: settingsService.get('order').pricingTiers, // Truyền danh sách bậc giá
        error: req.query.error
    });
};
// === END: CẬP NHẬT ĐỂ TRUYỀN DỮ LIỆU BẬC GIÁ ===

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
        
        // === START: THAY ĐỔI CÁCH TÍNH GIÁ ===
        const pricePerItem = settingsService.calculatePricePerItem(items.length);
        const totalCost = items.length * pricePerItem;
        // === END: THAY ĐỔI CÁCH TÍNH GIÁ ===

        if (user.balance < totalCost) {
            return res.redirect('/create-order?error=' + encodeURIComponent('Số dư không đủ.'));
        }

        const balanceBefore = user.balance;
        user.balance -= totalCost;
        await user.save();

        const newOrder = new Order({ user: userId, items, totalCost, pricePerItem });
        await newOrder.save();
        
        await logActivity(userId, 'CLIENT_CREATE_ORDER', {
            details: `Tạo đơn hàng #${newOrder.shortId} với ${items.length} items.`,
            ipAddress: req.ip || req.connection.remoteAddress,
            context: 'Client',
            metadata: {
                balanceBefore: balanceBefore,
                balanceAfter: user.balance,
                change: -totalCost
            }
        });

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

clientController.getOrderDetailPage = async (req, res) => {
    try {
        const order = await Order.findOne({
            _id: req.params.id,
            user: req.session.user.id
        }).lean();

        if (!order) {
            return res.status(404).send('Không tìm thấy đơn hàng.');
        }

        res.render('client/order-detail', {
            page: 'orders',
            title: `Chi Tiết Đơn Hàng #${order.shortId}`,
            order
        });
    } catch (error) {
        console.error("Client get order detail error:", error);
        res.status(500).send('Lỗi server.');
    }
};

clientController.getDepositPage = (req, res) => {
    const transferContent = `NAPTIEN ${req.session.user.username.toUpperCase()}`;
    const depositInfo = settingsService.get('deposit');
    res.render('client/deposit', {
        page: 'deposit',
        title: 'Nạp tiền vào tài khoản',
        transferContent,
        depositInfo
    });
};

module.exports = clientController;