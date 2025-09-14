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
        return res.redirect('/admin/accounts');
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
        const errorMessage = encodeURIComponent(errors.join('\n'));
        return res.redirect(`/admin/accounts?error=${errorMessage}`);
    }

    if (newAccounts.length > 0) {
        try {
            const result = await Account.insertMany(newAccounts, { ordered: false });
            const successMessage = encodeURIComponent(`Đã thêm thành công ${result.length} account.`);
            return res.redirect(`/admin/accounts?success=${successMessage}`);
        } catch (error) {
            let errorMessage;
            if (error.code === 11000 && error.insertedIds) {
                // [SỬA LỖI TẠI ĐÂY] Dùng error.insertedIds.length thay vì error.result.nInserted
                const insertedCount = error.insertedIds.length; 
                errorMessage = `Đã thêm ${insertedCount} account. Một số account khác bị lỗi trùng lặp UID và đã được bỏ qua.`;
            } else {
                errorMessage = `Lỗi server: ${error.message}`;
            }
            return res.redirect(`/admin/accounts?error=${encodeURIComponent(errorMessage)}`);
        }
    }
    
    const errorMessage = encodeURIComponent(errors.join('\n'));
    return res.redirect(`/admin/accounts?error=${errorMessage}`);
};

accountController.checkSelected = async (req, res) => {
    const { ids, selectAll, filters } = req.body;
    const io = req.io;
    
    let accountIdsToCheck = [];

    try {
        if (selectAll) {
            accountIdsToCheck = await accountService.findAllIds(filters);
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
                await Account.findByIdAndUpdate(accountId, { status: 'CHECKING' });
                io.emit('account:update', { id: accountId, status: 'CHECKING' });
                await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 3000));
                if (Math.random() < 0.15) {
                    throw new Error("Lỗi ngẫu nhiên khi check live");
                }
                const isLive = Math.random() > 0.4;
                return { isLive, checkedAt: new Date() }; 
            }
        }));

        checkLiveRunner.addTasks(tasks);

        checkLiveRunner.on('task:complete', async ({ result, taskWrapper }) => {
            const { isLive, checkedAt } = result;
            const newStatus = isLive ? 'LIVE' : 'DIE';
            
            await Account.findByIdAndUpdate(taskWrapper.id, {
                status: newStatus,
                lastCheckedAt: checkedAt
            });

            io.emit('account:update', {
                id: taskWrapper.id,
                status: newStatus,
                lastCheckedAt: checkedAt.toLocaleString('vi-VN')
            });
        });

        checkLiveRunner.on('task:error', async ({ error, taskWrapper }) => {
            console.error(`Lỗi không thể thử lại với account ID ${taskWrapper.id}: ${error.message}`);
            await Account.findByIdAndUpdate(taskWrapper.id, { status: 'ERROR' });
            io.emit('account:update', {
                id: taskWrapper.id,
                status: 'ERROR'
            });
        });
        
        checkLiveRunner.start();
    } catch (error) {
        console.error("Error preparing check live process:", error);
    }
};

module.exports = accountController;