// controllers/clientController.js
const User = require('../models/User');
const Order = require('../models/Order');
const Item = require('../models/Item');
const ActivityLog = require('../models/ActivityLog');
const settingsService = require('../utils/settingsService');
const { logActivity } = require('../utils/activityLogService');
const mongoose = require('mongoose');

const clientController = {};

// Định nghĩa nhãn cho các hành động phía client
const CLIENT_ACTION_LABELS = {
    'CLIENT_CREATE_ORDER': { label: 'Tạo Đơn hàng', color: 'bg-cyan-500/20 text-cyan-400' },
    'CLIENT_DEPOSIT': { label: 'Nạp tiền', color: 'bg-emerald-500/20 text-emerald-400' },
    'CLIENT_DEPOSIT_AUTO': { label: 'Nạp tiền Tự động', color: 'bg-teal-500/20 text-teal-400' },
    'ORDER_REFUND': { label: 'Hoàn tiền Đơn hàng', color: 'bg-orange-500/20 text-orange-400' },
    'ADMIN_ADJUST_BALANCE': { label: 'Admin Điều chỉnh', color: 'bg-purple-500/20 text-purple-400' },
};

clientController.getDashboard = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const [orderCount, pendingCount, spendingResult] = await Promise.all([
            Order.countDocuments({ user: userId, isDeleted: false }),
            Order.countDocuments({ user: userId, isDeleted: false, status: { $in: ['pending', 'processing'] } }),
            Order.aggregate([
                { $match: { user: new mongoose.Types.ObjectId(userId), isDeleted: false, status: 'completed' } },
                { $group: { _id: null, total: { $sum: '$totalCost' } } }
            ])
        ]);
        const recentOrders = await Order.find({ user: userId, isDeleted: false })
            .sort({ createdAt: -1 })
            .limit(5)
            .lean();
        const pricingTiersBM = (settingsService.get('order').pricingTiers['BM'] || []).sort((a, b) => a.quantity - b.quantity);
        const pricingTiersTKQC = (settingsService.get('order').pricingTiers['TKQC'] || []).sort((a, b) => a.quantity - b.quantity);
        const stats = {
            orders: orderCount,
            pending: pendingCount,
            balance: res.locals.user.balance,
            totalSpending: spendingResult.length > 0 ? spendingResult[0].total : 0
        };
        res.render('client/dashboard', { 
            page: 'dashboard',
            stats,
            recentOrders,
            pricingTiersBM,
            pricingTiersTKQC,
            title: 'Client Dashboard'
        });
    } catch (error) {
        console.error("Lỗi khi tải client dashboard:", error);
        res.status(500).render('client/dashboard', {
            page: 'dashboard',
            stats: { orders: 0, pending: 0, balance: res.locals.user.balance, totalSpending: 0 },
            recentOrders: [],
            pricingTiersBM: [],
            pricingTiersTKQC: [],
            title: 'Client Dashboard',
            error: "Không thể tải dữ liệu dashboard."
        });
    }
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

// === START: CẬP NHẬT LOGIC CONTROLLER ===

// Nâng cấp hàm helper để lấy cả lịch sử đơn hàng
async function renderCreateOrderPage(req, res, orderType) {
    try {
        // Lấy dữ liệu cho form tạo đơn hàng
        const orderSettings = settingsService.get('order');
        const pricingTiers = orderSettings.pricingTiers[orderType] || [];
        const maxItemsPerOrder = orderSettings.maxItemsPerOrder[orderType] || 0;
        
        // Lấy dữ liệu cho lịch sử đơn hàng (có phân trang)
        const pageNum = parseInt(req.query.page, 10) || 1;
        const limit = 10; // Số đơn hàng mỗi trang
        const query = { 
            user: req.session.user.id, 
            isDeleted: false,
            orderType: orderType // Lọc theo đúng loại đơn hàng
        };
        const totalItems = await Order.countDocuments(query);
        const orders = await Order.find(query)
            .sort({ createdAt: -1 })
            .skip((pageNum - 1) * limit)
            .limit(limit)
            .lean();

        res.render('client/create-order', {
            title: `Tạo đơn hàng kháng ${orderType}`,
            page: orderType === 'BM' ? 'create-order-bm' : 'create-order-tkqc',
            // Dữ liệu cho form
            pricingTiers: pricingTiers,
            maxItemsPerOrder: maxItemsPerOrder,
            orderType: orderType,
            error: req.query.error,
            // Dữ liệu cho bảng lịch sử
            orders,
            pagination: {
                totalItems,
                currentPage: pageNum,
                totalPages: Math.ceil(totalItems / limit),
            }
        });
    } catch (error) {
        console.error(`Error loading create order page for ${orderType}:`, error);
        res.status(500).send(`Could not load create order page.`);
    }
}

clientController.getCreateOrderBmPage = async (req, res) => {
    await renderCreateOrderPage(req, res, 'BM');
};

clientController.getCreateOrderTkqcPage = async (req, res) => {
    await renderCreateOrderPage(req, res, 'TKQC');
};

clientController.postCreateOrder = async (req, res) => {
    try {
        const { itemsData, orderType } = req.body;
        const userId = req.session.user.id;
        const user = await User.findById(userId);
        const redirectUrl = `/create-order/${orderType.toLowerCase()}`;

        if (!itemsData || itemsData.trim() === '') {
            return res.redirect(`${redirectUrl}?error=` + encodeURIComponent('Vui lòng nhập ít nhất một item.'));
        }

        const itemLines = itemsData.trim().split('\n').filter(line => line.trim() !== '');
        if (itemLines.length === 0) {
            return res.redirect(`${redirectUrl}?error=` + encodeURIComponent('Không có item nào hợp lệ.'));
        }
        
        const maxItemsPerOrder = settingsService.get('order').maxItemsPerOrder[orderType] || 0;
        if (maxItemsPerOrder > 0 && itemLines.length > maxItemsPerOrder) {
            return res.redirect(`${redirectUrl}?error=` + encodeURIComponent(`Số lượng items vượt quá giới hạn cho phép (${maxItemsPerOrder}).`));
        }

        const pricePerItem = settingsService.calculatePricePerItem(itemLines.length, orderType);
        const totalCost = itemLines.length * pricePerItem;

        if (user.balance < totalCost) {
            return res.redirect(`${redirectUrl}?error=` + encodeURIComponent('Số dư không đủ.'));
        }

        const balanceBefore = user.balance;
        user.balance -= totalCost;
        
        const newOrder = new Order({ 
            user: userId, 
            totalCost, 
            pricePerItem,
            totalItems: itemLines.length,
            orderType: orderType
        });

        const itemsToInsert = itemLines.map(line => ({
            orderId: newOrder._id,
            data: line.trim()
        }));

        await Promise.all([
            user.save(),
            newOrder.save(),
            Item.insertMany(itemsToInsert)
        ]);
        
        req.session.user.balance = user.balance;

        await logActivity(userId, 'CLIENT_CREATE_ORDER', {
            details: `Tạo đơn hàng #${newOrder.shortId} (${orderType}) với ${itemLines.length} items.`,
            ipAddress: req.ip || req.connection.remoteAddress,
            context: 'Client',
            metadata: {
                balanceBefore: balanceBefore,
                balanceAfter: user.balance,
                change: -totalCost
            }
        });
        
        req.io.to(userId.toString()).emit('balance:update', { newBalance: user.balance });

        // Redirect lại trang vừa tạo đơn để xem lịch sử
        res.redirect(redirectUrl);
    } catch (error) {
        console.error("Client order creation error:", error);
        const fallbackUrl = req.body.orderType ? `/create-order/${req.body.orderType.toLowerCase()}` : '/';
        res.redirect(`${fallbackUrl}?error=` + encodeURIComponent('Lỗi server, không thể tạo đơn hàng.'));
    }
};

// Xóa bỏ hàm getOrderListPage không còn dùng nữa
// clientController.getOrderListPage = async (req, res) => { ... };

// === END: CẬP NHẬT LOGIC CONTROLLER ===

clientController.getOrderDetailPage = async (req, res) => {
    try {
        const order = await Order.findOne({
            _id: req.params.id,
            user: req.session.user.id
        }).lean();

        if (!order) {
            return res.status(404).send('Không tìm thấy đơn hàng.');
        }

        const items = await Item.find({ orderId: order._id }).lean();
        order.items = items;
        
        res.render('client/order-detail', {
            page: 'orders', // Giữ nguyên để có thể quay lại từ trang chi tiết
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

clientController.getTransactionListPage = async (req, res) => {
    const pageNum = parseInt(req.query.page, 10) || 1;
    const limit = 20;

    const transactionActions = [
        'CLIENT_CREATE_ORDER',
        'CLIENT_DEPOSIT',
        'CLIENT_DEPOSIT_AUTO',
        'ORDER_REFUND',
        'ADMIN_ADJUST_BALANCE'
    ];

    const query = { 
        user: req.session.user.id, 
        action: { $in: transactionActions } 
    };

    try {
        const totalItems = await ActivityLog.countDocuments(query);
        const logs = await ActivityLog.find(query)
            .sort({ createdAt: -1 })
            .skip((pageNum - 1) * limit)
            .limit(limit)
            .lean();

        res.render('client/transactions', {
            page: 'transactions',
            title: 'Lịch Sử Giao Dịch',
            logs,
            actionLabels: CLIENT_ACTION_LABELS,
            pagination: {
                totalItems,
                currentPage: pageNum,
                totalPages: Math.ceil(totalItems / limit),
            },
            currentQuery: req.query
        });
    } catch (error) {
        console.error("Client get transaction list error:", error);
        res.status(500).send('Lỗi server khi tải lịch sử giao dịch.');
    }
};


module.exports = clientController;