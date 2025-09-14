// controllers/adminController.js
const Order = require('../models/Order');
const Log = require('../models/Log'); // Import Log

exports.getDashboard = async (req, res) => {
    try {
        // Lấy các số liệu thống kê
        const total = Order.countDocuments({});
        const processing = Order.countDocuments({ status: { $in: ['pending', 'processing'] } });
        const completed = Order.countDocuments({ status: 'completed' });
        const failed = Order.countDocuments({ status: 'failed' });

        // Lấy 20 đơn hàng gần nhất
        const recentOrdersQuery = Order.find({})
            .sort({ createdAt: -1 })
            .limit(20)
            .lean();

        // Chạy các query song song
        const [totalCount, processingCount, completedCount, failedCount, orders] = await Promise.all([
            total, processing, completed, failed, recentOrdersQuery
        ]);

        const stats = {
            total: totalCount,
            processing: processingCount,
            completed: completedCount,
            failed: failedCount,
        };
        
        // Thêm bộ đếm cho mỗi đơn hàng
        orders.forEach(order => {
            order.completedItems = 0;
            order.failedItems = 0;
            order.items.forEach(item => {
                if (item.status === 'completed') order.completedItems++;
                else if (item.status === 'failed') order.failedItems++;
            });
        });

        res.render('dashboard', { stats, orders });

    } catch (error) {
        console.error("Error loading admin dashboard:", error);
        res.status(500).send("Could not load admin dashboard.");
    }
};

// Hàm mới để lấy chi tiết đơn hàng
exports.getOrderDetail = async (req, res) => {
    try {
        const { id } = req.params;
        
        const order = await Order.findById(id).lean();
        if (!order) {
            return res.status(404).send("Order not found.");
        }

        const logs = await Log.find({ orderId: id }).sort({ timestamp: 1 });

        res.render('order-detail', { order, logs });

    } catch (error) {
        console.error("Error loading order detail:", error);
        res.status(500).send("Could not load order details.");
    }
};

// GET /admin/orders - Hiển thị trang quản lý đơn hàng
exports.getOrderManagementPage = async (req, res) => {
    try {
        // Lấy tất cả đơn hàng, sắp xếp từ mới nhất
        const orders = await Order.find({}).sort({ createdAt: -1 }).lean();

        // Xử lý bộ đếm cho mỗi đơn hàng
        orders.forEach(order => {
            order.completedItems = 0;
            order.failedItems = 0;
            order.items.forEach(item => {
                if (item.status === 'completed') order.completedItems++;
                else if (item.status === 'failed') order.failedItems++;
            });
        });

        res.render('orders', { orders }); // Render ra view mới là orders.ejs
    } catch (error) {
        console.error("Error loading order management page:", error);
        res.status(500).send("Could not load order management page.");
    }
};

// POST /admin/orders/create - Tạo đơn hàng mới từ admin
exports.createOrderFromAdmin = async (req, res) => {
    try {
        const { itemsData } = req.body;
        if (!itemsData || itemsData.trim() === '') {
            // Nếu không có dữ liệu, chỉ cần tải lại trang
            return res.redirect('/admin/orders');
        }

        const items = itemsData.trim().split('\n').map(line => {
            return { data: line.trim(), status: 'queued' };
        });

        if (items.length > 0) {
            const order = new Order({ items });
            await order.save();
            await orderQueue.add('process-order', { orderId: order._id });
        }
        
        res.redirect('/admin/orders');
    } catch (error) {
        console.error("Error creating order from admin:", error);
        res.status(500).send("Failed to create order.");
    }
};
