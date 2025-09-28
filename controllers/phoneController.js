// controllers/phoneController.js
const PhoneNumber = require('../models/PhoneNumber');
const CrudService = require('../utils/crudService');
const createCrudController = require('./crudController');

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

module.exports = phoneController;