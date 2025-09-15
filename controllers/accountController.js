// controllers/accountController.js
const Account = require('../models/Account');
const CrudService = require('../utils/crudService');
const createCrudController = require('./crudController');
const { runCheckLive } = require('../utils/checkLiveService');
const settingsService = require('../utils/settingsService'); // THÊM DÒNG NÀY

const accountService = new CrudService(Account, {
    searchableFields: ['uid', 'proxy']
});

// === SỬA Ở ĐÂY ===
const accountController = createCrudController(accountService, 'accounts', {
    single: 'account',
    plural: 'accounts'
});


accountController.addMultiple = async (req, res) => {
    const { accountsData } = req.body;
    if (!accountsData || accountsData.trim() === '') {
        return res.status(400).json({ success: false, message: "Dữ liệu account trống." });
    }
    const lines = accountsData.trim().split('\n').filter(line => line.trim() !== '');
    const newAccounts = [];
    const errors = [];

    lines.forEach((line, index) => {
        const parts = line.trim().split('|');
        if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) {
            errors.push(`Dòng ${index + 1}: Sai định dạng. Yêu cầu uid|password|2fa.`);
            return;
        }
        newAccounts.push({
            uid: parts[0],
            password: parts[1],
            twofa: parts[2],
            proxy: parts[3] || ''
        });
    });
    
    if (errors.length > 0 && newAccounts.length === 0) {
        return res.status(400).json({ success: false, message: errors.join('\n') });
    }

    if (newAccounts.length > 0) {
        try {
            const result = await Account.insertMany(newAccounts, { ordered: false });
            return res.json({ success: true, message: `Đã thêm thành công ${result.length} account.` });
        } catch (error) {
            let errorMessage;
            if (error.code === 11000 && error.insertedIds) {
                const insertedCount = error.insertedIds.length; 
                errorMessage = `Đã thêm ${insertedCount} account. Một số account khác bị lỗi trùng lặp UID và đã được bỏ qua.`;
            } else {
                errorMessage = `Lỗi server: ${error.message}`;
            }
             return res.status(500).json({ success: false, message: errorMessage });
        }
    }
    
    return res.status(400).json({ success: false, message: errors.join('\n') });
};


// === START: THAY ĐỔI QUAN TRỌNG ===
// Sửa lại hàm checkSelected để truyền config vào service
accountController.checkSelected = async (req, res) => {
    const { ids, selectAll, filters } = req.body;
    const io = req.io;
    
    try {
        let accountIdsToCheck = [];

        if (selectAll) {
            const queryOptions = { ...filters, sortBy: 'createdAt', sortOrder: 'asc' };
            accountIdsToCheck = await accountService.findAllIds(queryOptions);
        } else {
            accountIdsToCheck = ids;
        }

        if (!accountIdsToCheck || accountIdsToCheck.length === 0) {
            return res.status(400).json({ success: false, message: 'Không có account nào được chọn.' });
        }
    
        // Phản hồi ngay cho client biết là đã nhận lệnh
        res.json({ success: true, message: `Đã bắt đầu tiến trình check live cho ${accountIdsToCheck.length} accounts.` });

        // Lấy cấu hình check-live từ settings
        const checkLiveConfig = settingsService.get('autoCheck');

        // Chạy tiến trình check live ở background với config đã lấy
        runCheckLive(accountIdsToCheck, io, {
            concurrency: checkLiveConfig.concurrency,
            delay: checkLiveConfig.delay,
            timeout: checkLiveConfig.timeout
        });

    } catch (error) {
        console.error("Error preparing check live process:", error);
         if (!res.headersSent) {
            res.status(500).json({ success: false, message: 'Lỗi server khi chuẩn bị tiến trình check live.' });
        }
    }
};
// === END: THAY ĐỔI QUAN TRỌNG ===

module.exports = accountController;