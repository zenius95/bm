// controllers/whatsappController.js
const { v4: uuidv4 } = require('uuid');
const Whatsapp = require('../models/Whatsapp');
const CrudService = require('../utils/crudService');
const createCrudController = require('./crudController');
const whatsappManager = require('../utils/whatsappManager');
// --- START: THÊM IMPORT MỚI ---
const { runCheckWhatsapp } = require('../utils/checkWhatsappService');
const settingsService = require('../utils/settingsService');
// --- END: THÊM IMPORT MỚI ---

const whatsappService = new CrudService(Whatsapp, {
    searchableFields: ['sessionId', 'phoneNumber']
});

const whatsappController = createCrudController(whatsappService, 'whatsapp', {
    single: 'whatsapp',
    plural: 'whatsapp'
});

// Ghi đè lại hàm getAll để render đúng view
whatsappController.handleGetAll = async (req, res) => {
    try {
        const { data, pagination } = await whatsappService.find(req.query);
        const trashCount = await whatsappService.Model.countDocuments({ isDeleted: true });
        const title = 'Whatsapp Management';
        res.render('admin/whatsapp', {
            whatsapp: data,
            pagination,
            trashCount,
            title,
            page: 'whatsapp',
            currentQuery: res.locals.currentQuery
        });
    } catch (error) {
        console.error(`Error getting all whatsapp sessions:`, error);
        res.status(500).send(`Could not load whatsapp sessions.`);
    }
};

// Hàm mới để bắt đầu quá trình quét QR
whatsappController.initiateSession = (req, res) => {
    try {
        const tempSessionId = `wa-session-${uuidv4()}`;
        whatsappManager.initializeClient(tempSessionId, req.io);
        res.json({ success: true, message: 'Đang khởi tạo phiên, vui lòng chờ mã QR.', tempSessionId });
    } catch (error) {
        res.status(500).json({ success: false, message: `Lỗi server: ${error.message}` });
    }
};

// --- START: THÊM HÀM MỚI ---
whatsappController.checkSelected = async (req, res) => {
    const { ids, selectAll, filters } = req.body;
    const io = req.io;
    
    try {
        let whatsappIdsToCheck = [];
        if (selectAll) {
            whatsappIdsToCheck = await whatsappService.findAllIds(filters);
        } else {
            whatsappIdsToCheck = ids;
        }

        if (!whatsappIdsToCheck || whatsappIdsToCheck.length === 0) {
            return res.status(400).json({ success: false, message: 'Không có phiên nào được chọn.' });
        }
    
        res.json({ success: true, message: `Đã bắt đầu tiến trình kiểm tra cho ${whatsappIdsToCheck.length} phiên WhatsApp.` });

        const checkConfig = settingsService.get('autoWhatsappCheck');
        runCheckWhatsapp(whatsappIdsToCheck, io, {
             // Có thể thêm các option cụ thể ở đây nếu cần
        });

    } catch (error) {
        console.error("Lỗi khi chuẩn bị tiến trình kiểm tra WhatsApp:", error);
         if (!res.headersSent) {
            res.status(500).json({ success: false, message: 'Lỗi server.' });
        }
    }
};
// --- END: THÊM HÀM MỚI ---

module.exports = whatsappController;