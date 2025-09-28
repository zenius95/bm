// controllers/phoneController.js
const PhoneNumber = require('../models/PhoneNumber');
const phoneScraper = require('../utils/phoneScraper');

const phoneController = {};

phoneController.list = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const skip = (page - 1) * limit;
        const searchQuery = req.query.search || '';

        let query = {};
        if (searchQuery) {
            query = {
                $or: [
                    { phoneNumber: { $regex: searchQuery, $options: 'i' } },
                    { country: { $regex: searchQuery, $options: 'i' } },
                    { source: { $regex: searchQuery, $options: 'i' } }
                ]
            };
        }

        const phones = await PhoneNumber.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(); // Dùng lean() để tăng tốc độ

        const totalPhones = await PhoneNumber.countDocuments(query);
        const totalPages = Math.ceil(totalPhones / limit);

        res.render('admin/phones', {
            title: 'Quản lý Số điện thoại',
            phones,
            currentPage: page,
            totalPages,
            searchQuery,
            layout: 'layouts/main'
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Lỗi Server');
    }
};

phoneController.deletePhone = async (req, res) => {
    try {
        await PhoneNumber.findByIdAndDelete(req.params.id);
        req.flash('success_msg', 'Đã xóa số điện thoại.');
        res.redirect('/admin/phones');
    } catch (error) {
        console.error(error);
        req.flash('error_msg', 'Lỗi khi xóa số điện thoại.');
        res.redirect('/admin/phones');
    }
};

phoneController.deleteAllPhones = async (req, res) => {
    try {
        await PhoneNumber.deleteMany({});
        req.flash('success_msg', 'Đã xóa tất cả số điện thoại.');
        res.redirect('/admin/phones');
    } catch (error) {
        console.error(error);
        req.flash('error_msg', 'Lỗi khi xóa tất cả số điện thoại.');
        res.redirect('/admin/phones');
    }
};

phoneController.getMessagesForPhone = async (req, res) => {
    try {
        const phone = await PhoneNumber.findById(req.params.id).lean();
        if (!phone) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy số điện thoại.' });
        }

        const messages = await phoneScraper.getMessages(phone.country, phone.phoneNumber);
        
        res.json({ success: true, messages });

    } catch (error) {
        console.error('Lỗi khi lấy tin nhắn:', error);
        res.status(500).json({ success: false, message: 'Lỗi server khi lấy tin nhắn.' });
    }
};

module.exports = phoneController;