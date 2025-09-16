// routes/admin.js
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const accountController = require('../controllers/accountController');
const settingController = require('../controllers/settingController');
const workerController = require('../controllers/workerController');
const userController = require('../controllers/userController');
const activityLogController = require('../controllers/activityLogController');
const proxyController = require('../controllers/proxyController'); 


router.use(accountController.parseQueryMiddleware);
router.use(adminController.parseQueryMiddleware);
router.use(userController.parseQueryMiddleware);
router.use(proxyController.parseQueryMiddleware); 

router.get('/', adminController.getDashboard);

// --- Account Routes ---
router.get('/accounts', accountController.handleGetAll);
router.post('/accounts/add-multiple', accountController.addMultiple);
router.post('/accounts/soft-delete', accountController.handleSoftDelete);
router.post('/accounts/restore', accountController.handleRestore);
router.post('/accounts/hard-delete', accountController.handleHardDelete);
router.post('/accounts/check-selected', accountController.checkSelected);

// --- Proxy Routes ---
router.get('/proxies', proxyController.handleGetAll);
router.post('/proxies/create', proxyController.handleCreate);
router.post('/proxies/update/:id', proxyController.handleUpdate);
router.post('/proxies/soft-delete', proxyController.handleSoftDelete); // Thêm route mới
router.post('/proxies/restore', proxyController.handleRestore);     // Thêm route mới
router.post('/proxies/hard-delete', proxyController.handleHardDelete);
router.post('/proxies/check-selected', proxyController.checkSelected);

// --- Order Routes ---
router.get('/orders', adminController.handleGetAll);
router.get('/orders/:id', adminController.handleGetById);
router.post('/orders/create', adminController.handleCreate);
router.post('/orders/soft-delete', adminController.handleSoftDelete);
router.post('/orders/restore', adminController.handleRestore);
router.post('/orders/hard-delete', adminController.handleHardDelete);

// --- User Management Routes ---
router.get('/users', userController.handleGetAll);
router.post('/users/create', userController.handleCreate);
router.post('/users/update/:id', userController.handleUpdate); 
router.post('/users/hard-delete', userController.handleHardDelete);

// --- Worker Management Route ---
router.get('/workers', workerController.getWorkersPage);
router.post('/workers', workerController.addWorker);
router.post('/workers/:id', workerController.updateWorker);
router.delete('/workers/:id', workerController.deleteWorker);
router.get('/workers/:id/logs', workerController.getWorkerLogs);
router.post('/workers/:id/toggle', workerController.toggleWorker);

// --- Activity Log & Transaction Routes ---
router.get('/activity-logs', activityLogController.handleGetAll);
router.post('/activity-logs/hard-delete', activityLogController.handleHardDelete);
router.get('/transactions', activityLogController.getTransactionLogs);
router.post('/transactions/hard-delete', activityLogController.handleHardDelete);


// --- Settings Routes ---
router.get('/settings', settingController.getSettingsPage);
router.post('/settings/api-key/update', settingController.updateMasterApiKey);
router.post('/settings/order/config', settingController.updateOrderConfig);
router.post('/settings/deposit/config', settingController.updateDepositConfig);
router.post('/settings/auto-check/config', settingController.updateAutoCheckConfig);
router.post('/settings/auto-proxy-check/config', settingController.updateAutoProxyCheckConfig);
router.get('/settings/auto-check/status', settingController.getAutoCheckStatus);
router.post('/settings/item-processor/config', settingController.updateItemProcessorConfig);
router.post('/settings/auto-deposit/config', settingController.updateAutoDepositConfig);

module.exports = router;