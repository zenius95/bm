// routes/client.js
const express = require('express');
const router = express.Router();
const clientController = require('../controllers/clientController');

// Route cho trang dashboard của client
router.get('/dashboard', clientController.getDashboard);

// === START: THÊM ROUTE MỚI ===
router.get('/profile', clientController.getProfilePage);
router.post('/profile', clientController.updateProfile);

router.get('/create-order', clientController.getCreateOrderPage);
router.post('/create-order', clientController.postCreateOrder);
router.get('/orders', clientController.getOrderListPage);
router.get('/orders/:id', clientController.getOrderDetailPage);

router.get('/deposit', clientController.getDepositPage);

// === END ===

module.exports = router;