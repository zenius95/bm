// routes/admin.js
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const accountController = require('../controllers/accountController');

// Middleware parse query cho tất cả các route bên dưới
router.use(accountController.parseQueryMiddleware);
router.use(adminController.parseQueryMiddleware);

// Dashboard
router.get('/dashboard', adminController.getDashboard);

// --- Account Routes ---
router.get('/accounts', accountController.handleGetAll); // Route này sẽ xử lý cả danh sách chính và thùng rác
router.post('/accounts/add-multiple', accountController.addMultiple);
router.post('/accounts/soft-delete', accountController.handleSoftDelete);
router.post('/accounts/restore', accountController.handleRestore);
router.post('/accounts/hard-delete', accountController.handleHardDelete);
router.post('/accounts/check-selected', accountController.checkSelected);

// --- Order Routes ---
router.get('/orders', adminController.handleGetAll); // Route này sẽ xử lý cả danh sách chính và thùng rác
router.get('/orders/:id', adminController.handleGetById);
router.post('/orders/create', adminController.handleCreate);
router.post('/orders/soft-delete', adminController.handleSoftDelete);
router.post('/orders/restore', adminController.handleRestore);
router.post('/orders/hard-delete', adminController.handleHardDelete);

module.exports = router;