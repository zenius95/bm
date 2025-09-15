// routes/client.js
const express = require('express');
const router = express.Router();
const clientController = require('../controllers/clientController');

// Route cho trang dashboard của client
router.get('/dashboard', clientController.getDashboard);

// Sau này Bro có thể thêm các route khác của client ở đây
// router.get('/profile', ...);
// router.get('/my-orders', ...);

module.exports = router;