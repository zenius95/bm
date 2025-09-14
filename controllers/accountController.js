// controllers/accountController.js
const Account = require('../models/Account');
const CrudService = require('../utils/crudService');
const createCrudController = require('./crudController');
const ProcessRunner = require('../utils/processRunner');

const accountService = new CrudService(Account, {
    searchableFields: ['uid', 'proxy']
});

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


accountController.checkSelected = async (req, res) => {
    const { ids, selectAll, filters } = req.body;
    const io = req.io;
    
    let accountIdsToCheck = [];

    try {
        if (selectAll) {
            const queryOptions = { ...filters, sortBy: 'createdAt', sortOrder: 'asc' };
            accountIdsToCheck = await accountService.findAllIds(queryOptions);
        } else {
            accountIdsToCheck = ids;
        }

        if (!accountIdsToCheck || accountIdsToCheck.length === 0) {
            return res.status(400).json({ success: false, message: 'Không có account nào được chọn.' });
        }
    
        res.json({ success: true, message: `Đã bắt đầu tiến trình check live cho ${accountIdsToCheck.length} accounts.` });

        const checkLiveRunner = new ProcessRunner({
            concurrency: 10,
            delay: 500,
            retries: 2,
            timeout: 45000,
            maxErrors: 20,
        });

        const tasks = accountIdsToCheck.map(accountId => ({
            id: accountId,
            task: async () => {
                const currentAccount = await Account.findById(accountId).lean();
                await Account.findByIdAndUpdate(accountId, { status: 'CHECKING' });
                io.emit('account:update', { 
                    id: accountId, 
                    status: 'CHECKING',
                    dieStreak: currentAccount ? currentAccount.dieStreak : 0
                });
                
                await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 3000));
                if (Math.random() < 0.15) {
                    throw new Error("Lỗi ngẫu nhiên khi check live");
                }
                const isLive = false;
                return { isLive, checkedAt: new Date() }; 
            }
        }));

        checkLiveRunner.addTasks(tasks);

        checkLiveRunner.on('task:complete', async ({ result, taskWrapper }) => {
            const { isLive, checkedAt } = result;
            const accountId = taskWrapper.id;

            const account = await Account.findById(accountId);
            if (!account) return;

            const updateData = {
                lastCheckedAt: checkedAt
            };

            if (isLive) {
                updateData.status = 'LIVE';
                updateData.dieStreak = 0;
            } else { 
                updateData.status = 'DIE';
                updateData.dieStreak = (account.dieStreak || 0) + 1;
            }

            if (updateData.dieStreak >= 5) {
                updateData.isDeleted = true;
                updateData.deletedAt = new Date();
                
                await Account.findByIdAndUpdate(accountId, updateData);
                io.emit('account:trashed', { id: accountId, message: `Account ${account.uid} đã bị xóa do die 5 lần liên tiếp.` });
            } else {
                await Account.findByIdAndUpdate(accountId, updateData);
                io.emit('account:update', {
                    id: accountId,
                    status: updateData.status,
                    lastCheckedAt: checkedAt.toLocaleString('vi-VN'),
                    dieStreak: updateData.dieStreak
                });
            }
        });


        checkLiveRunner.on('task:error', async ({ error, taskWrapper }) => {
            console.error(`Lỗi không thể thử lại với account ID ${taskWrapper.id}: ${error.message}`);
            const updatedAccount = await Account.findByIdAndUpdate(taskWrapper.id, { status: 'ERROR' }, { new: true }).lean();
            
            if (updatedAccount) {
                 io.emit('account:update', {
                    id: taskWrapper.id,
                    status: 'ERROR',
                    dieStreak: updatedAccount.dieStreak
                });
            }
        });
        
        // === START: THAY ĐỔI QUAN TRỌNG ===
        // Thêm event listener cho sự kiện 'end' của runner
        checkLiveRunner.on('end', () => {
            console.log('[ProcessRunner] All check live tasks have finished.');
            io.emit('checklive:end', { message: 'Check live process has finished.' });
        });
        // === END: THAY ĐỔI QUAN TRỌNG ===

        checkLiveRunner.start();
    } catch (error) {
        console.error("Error preparing check live process:", error);
         if (!res.headersSent) {
            res.status(500).json({ success: false, message: 'Lỗi server khi chuẩn bị tiến trình check live.' });
        }
    }
};

module.exports = accountController;