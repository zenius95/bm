// routes/client.js
const express = require('express');
const router = express.Router();
const clientController = require('../controllers/clientController');

// Route cho trang dashboard của client
router.get('/dashboard', clientController.getDashboard);

// === START: THÊM ROUTE MỚI CHO PROFILE ===
router.get('/profile', clientController.getProfilePage);
router.post('/profile', clientController.updateProfile);
// === END ===

module.exports = router;