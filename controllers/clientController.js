// controllers/clientController.js
const clientController = {};

// Hiển thị trang dashboard chính của client
clientController.getDashboard = (req, res) => {
    // Dữ liệu mẫu, sau này Bro có thể thay bằng dữ liệu thật
    const stats = {
        orders: 15,
        pending: 2,
        balance: res.locals.user.balance 
    };
    res.render('client/dashboard', { 
        page: 'dashboard',
        stats
    });
};

module.exports = clientController;