// controllers/accountController.js
const Account = require('../models/Account');
const CrudService = require('../utils/crudService');
const createCrudController = require('./crudController');
const { runCheckLive } = require('../utils/checkLiveService');
const settingsService = require('../utils/settingsService');
const { logActivity } = require('../utils/activityLogService');

const accountService = new CrudService(Account, {
    searchableFields: ['uid', 'proxy'],
    additionalSoftDeleteFields: { status: 'UNCHECKED' },
    defaultSort: { lastCheckedAt: -1 } // <<< THÊM DÒNG NÀY ĐỂ SẮP XẾP MẶC ĐỊNH
});

const accountController = createCrudController(accountService, 'accounts', {
    single: 'account',
    plural: 'accounts'
});

// Chức năng của hàm này không còn cần thiết trong mô hình proxy chia sẻ
const releaseProxiesForAccounts = async (accountIds) => {
    if (!accountIds || accountIds.length === 0) return;
    console.log(`Account deletion event for ${accountIds.length} accounts. No proxy status will be changed.`);
};

accountController.addMultiple = async (req, res) => {
    const { accountsData } = req.body;
    if (!accountsData || accountsData.trim() === '') {
        return res.status(400).json({ success: false, message: "Dữ liệu account trống." });
    }
    const lines = accountsData.trim().split('\n').filter(line => line.trim() !== '');
    const newAccounts = [];
    let addedCount = 0;

    lines.forEach(line => {
        const parts = line.trim().split('|');
        if (parts.length >= 3) {
            newAccounts.push({ 
                uid: parts[0], 
                password: parts[1], 
                twofa: parts[2], 
                email: parts[3] || '',
                proxy: ''
            });
        }
    });
    
    if (newAccounts.length > 0) {
        try {
            const result = await Account.insertMany(newAccounts, { ordered: false });
            addedCount = result.length;
        } catch (error) {
            if (error.code === 11000 && error.insertedIds) {
                addedCount = error.insertedIds.length;
            }
        }
    }
    
    if (addedCount > 0) {
        await logActivity(req.session.user.id, 'ADMIN_ADD_ACCOUNTS', {
            details: `Admin '${req.session.user.username}' đã thêm ${addedCount} tài khoản mới.`,
            ipAddress: req.ip || req.connection.remoteAddress,
            context: 'Admin'
        });
        return res.json({ success: true, message: `Đã thêm thành công ${addedCount} account. Các account trùng lặp đã được bỏ qua.` });
    }
    
    return res.status(400).json({ success: false, message: 'Không có account nào hợp lệ để thêm.' });
};

accountController.checkSelected = async (req, res) => {
    const { ids, selectAll, filters } = req.body;
    const io = req.io;
    
    try {
        let accountIdsToCheck = [];
        if (selectAll) {
            accountIdsToCheck = await accountService.findAllIds(filters);
        } else {
            accountIdsToCheck = ids;
        }

        if (!accountIdsToCheck || accountIdsToCheck.length === 0) {
            return res.status(400).json({ success: false, message: 'Không có account nào được chọn.' });
        }
    
        await logActivity(req.session.user.id, 'ADMIN_MANUAL_CHECKLIVE', {
            details: `Admin '${req.session.user.username}' đã bắt đầu check live cho ${accountIdsToCheck.length} tài khoản.`,
            ipAddress: req.ip || req.connection.remoteAddress,
            context: 'Admin'
        });

        res.json({ success: true, message: `Đã bắt đầu tiến trình check live cho ${accountIdsToCheck.length} accounts.` });

        const checkLiveConfig = settingsService.get('autoCheck');
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

const originalSoftDelete = accountController.handleSoftDelete;
accountController.handleSoftDelete = async (req, res, next) => {
    const { ids, selectAll } = req.body;
    const count = selectAll ? 'tất cả' : ids.length;
    await originalSoftDelete(req, res, next);
    await logActivity(req.session.user.id, 'ADMIN_SOFT_DELETE_ACCOUNTS', {
        details: `Admin '${req.session.user.username}' đã chuyển ${count} tài khoản vào thùng rác.`,
        ipAddress: req.ip || req.connection.remoteAddress,
        context: 'Admin'
    });
};

const originalRestore = accountController.handleRestore;
accountController.handleRestore = async (req, res, next) => {
    const { ids, selectAll } = req.body;
    const count = selectAll ? 'tất cả' : ids.length;
    await originalRestore(req, res, next);
    await logActivity(req.session.user.id, 'ADMIN_RESTORE_ACCOUNTS', {
        details: `Admin '${req.session.user.username}' đã khôi phục ${count} tài khoản.`,
        ipAddress: req.ip || req.connection.remoteAddress,
        context: 'Admin'
    });
};

const originalHardDelete = accountController.handleHardDelete;
accountController.handleHardDelete = async (req, res, next) => {
    const { ids, selectAll } = req.body;
    const count = selectAll ? 'tất cả' : ids.length;
    await originalHardDelete(req, res, next);
    await logActivity(req.session.user.id, 'ADMIN_HARD_DELETE_ACCOUNTS', {
        details: `Admin '${req.session.user.username}' đã xóa vĩnh viễn ${count} tài khoản.`,
        ipAddress: req.ip || req.connection.remoteAddress,
        context: 'Admin'
    });
};

module.exports = accountController;