// routes/client.js
const express = require('express');
const router = express.Router();
const clientController = require('../controllers/clientController');

// Thêm middleware để lấy query string cho tất cả các route của client
router.use((req, res, next) => {
    res.locals.currentQuery = req.query;
    next();
});

// Route cho trang dashboard của client
router.get('/', clientController.getDashboard);

router.get('/profile', clientController.getProfilePage);
router.post('/profile', clientController.updateProfile);

// === START: THAY ĐỔI ROUTE ===
router.post('/create-order', clientController.postCreateOrder);
router.get('/create-order/bm', clientController.getCreateOrderBmPage);
router.get('/create-order/tkqc', clientController.getCreateOrderTkqcPage);

// Xóa route /orders cũ
// router.get('/orders', clientController.getOrderListPage); 
router.get('/orders/:id', clientController.getOrderDetailPage); // Giữ lại route chi tiết
// === END: THAY ĐỔI ROUTE ===

router.get('/deposit', clientController.getDepositPage);

router.get('/transactions', clientController.getTransactionListPage);

module.exports = router;