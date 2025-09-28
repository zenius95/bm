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

// Override the getAll handler to render the correct view and get necessary info
phoneController.handleGetAll = async (req, res) => {
    try {
        const { data, pagination } = await phoneService.find(req.query);
        const trashCount = await phoneService.Model.countDocuments({ isDeleted: true });
        
        // Get lists of countries and sources from the DB for filtering
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