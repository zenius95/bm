// controllers/phoneController.js
const PhoneNumber = require('../models/PhoneNumber');
const CrudService = require('../utils/crudService');
const createCrudController = require('./crudController');
const { getCodeFromPhonePage } = require('../utils/phoneScraper');

const phoneService = new CrudService(PhoneNumber, {
    searchableFields: ['phoneNumber', 'country', 'source']
});

const phoneController = createCrudController(phoneService, 'phones', {
    single: 'phone',
    plural: 'phones'
});

// Ghi đè lại hàm getAll để render đúng view và lấy các thông tin cần thiết
phoneController.handleGetAll = async (req, res) => {
    try {
        const { data, pagination } = await phoneService.find(req.query);
        const trashCount = await phoneService.Model.countDocuments({ isDeleted: true });
        
        // Lấy danh sách các quốc gia và nguồn từ DB để đưa vào bộ lọc
        const countries = await PhoneNumber.distinct('country');
        const sources = await PhoneNumber.distinct('source');

        res.render('admin/phones', {
            phones: data,
            pagination,
            trashCount,
            countries,
            sources,
            title: 'Phone Number Management',
            page: 'phones',
            currentQuery: res.locals.currentQuery
        });
    } catch (error) {
        console.error(`Error getting all phone numbers:`, error);
        res.status(500).send(`Could not load phone numbers.`);
    }
};

// --- START: SỬA LỖI ---
/**
 * Lấy tin nhắn cho một số điện thoại cụ thể.
 */
phoneController.getMessagesForPhone = async (req, res) => {
    try {
        const { id } = req.params;
        const { service = 'instagram', maxAge = '5m' } = req.body;

        const phone = await PhoneNumber.findById(id).lean();
        if (!phone) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy số điện thoại.' });
        }

        // Chuyển đổi maxAge thành số giây
        const timeMatch = maxAge.match(/^(\d+)([smhdM])$/); // Thêm 'M' để hỗ trợ tháng
        let maxAgeInSeconds = 300; // Mặc định 5 phút
        if (timeMatch) {
            const value = parseInt(timeMatch[1], 10);
            const unit = timeMatch[2];
            if (unit === 's') maxAgeInSeconds = value;
            if (unit === 'm') maxAgeInSeconds = value * 60;
            if (unit === 'h') maxAgeInSeconds = value * 3600;
            if (unit === 'd') maxAgeInSeconds = value * 86400;
            if (unit === 'M') maxAgeInSeconds = value * 2592000; // Thêm logic cho tháng
        }
        
        const result = await getCodeFromPhonePage(phone.country, phone.phoneNumber, service, maxAgeInSeconds);

        res.json({ success: true, data: result });

    } catch (error) {
        console.error(`Lỗi khi lấy tin nhắn cho SĐT #${req.params.id}:`, error);
        res.status(500).json({ success: false, message: error.message });
    }
};
// --- END: SỬA LỖI ---

module.exports = phoneController;