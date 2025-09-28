// routes/phoneApi.js
const express = require('express');
const router = express.Router();
const phoneApiController = require('../controllers/phoneApiController');
// const apiKeyAuthController = require('../controllers/apiKeyAuthController'); // <<< KHÔNG CẦN DÙNG NỮA

// THAY ĐỔI: Loại bỏ middleware xác thực ở đây
// router.use(apiKeyAuthController); 

// API để lấy một số điện thoại khả dụng
router.get('/get-number', phoneApiController.getPhoneNumber);

// API để lấy code từ một số điện thoại
router.get('/get-code', phoneApiController.getCode);

// API để hủy/nhả một số điện thoại đang dùng
router.get('/cancel-number', phoneApiController.cancelPhoneNumber);

module.exports = router;