// routes/admin.js
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const accountController = require('../controllers/accountController');

// Dashboard routes
router.get('/dashboard', adminController.getDashboard);
router.get('/orders/:id', adminController.getOrderDetail);

// Order Management routes
router.get('/orders', adminController.getOrderManagementPage);
router.post('/orders/create', adminController.createOrderFromAdmin);

// Account management routes
router.get('/accounts', accountController.getAccountPage);
router.post('/accounts/add', accountController.addAccounts);
router.post('/accounts/delete', accountController.deleteAccounts);

// Route mới để check live các account đã chọn
router.post('/accounts/check-selected', accountController.checkSelectedAccounts);

module.exports = router;