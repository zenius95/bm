// routes/admin.js
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const accountController = require('../controllers/accountController'); // Import controller mới

// Dashboard routes
router.get('/dashboard', adminController.getDashboard);
router.get('/orders/:id', adminController.getOrderDetail);

// Account management routes
router.get('/accounts', accountController.getAccountPage);
router.post('/accounts/add', accountController.addAccounts);
router.post('/accounts/delete', accountController.deleteAccounts); // Dùng POST cho an toàn

module.exports = router;