// utils/checkLiveService.js
const Account = require('../models/Account');
const ProcessRunner = require('./processRunner');
const runInsta = require('../../src/runInsta.js');

/**
 * Dịch vụ kiểm tra trạng thái live của các account.
 * @param {string[]} accountIds - Mảng các ID của account cần kiểm tra.
 * @param {import('socket.io').Server} io - Instance của Socket.IO server để gửi sự kiện.
 * @param {object} options - Các tùy chọn cho ProcessRunner.
 * @param {number} options.concurrency - Số luồng.
 * @param {number} options.delay - Delay giữa các task.
 * @param {number} options.timeout - Timeout cho mỗi task.
 */
// === START: THAY ĐỔI QUAN TRỌNG ===
async function runCheckLive(accountIds, io, options) {
// === END: THAY ĐỔI QUAN TRỌNG ===
    if (!accountIds || accountIds.length === 0) {
        console.log('[CheckLiveService] Không có account nào để kiểm tra.');
        return;
    }

    console.log(`[CheckLiveService] Bắt đầu tiến trình check live cho ${accountIds.length} accounts.`);

    console.log(options)

    // === START: THAY ĐỔI QUAN TRỌNG ===
    // Sử dụng options được truyền vào
    const checkLiveRunner = new ProcessRunner({
        concurrency: options.concurrency || 10,
        delay: options.delay || 500,
        timeout: options.timeout || 180000,
        retries: 2,
        maxErrors: 20,
    });
    // === END: THAY ĐỔI QUAN TRỌNG ===

    const tasks = accountIds.map(accountId => ({
        id: accountId,
        task: async () => {
            const currentAccount = await Account.findById(accountId).lean();
            if (!currentAccount) throw new Error(`Account không tồn tại: ${accountId}`);

            await Account.findByIdAndUpdate(accountId, { status: 'CHECKING' });
            io.emit('account:update', { 
                id: accountId, 
                status: 'CHECKING',
                dieStreak: currentAccount.dieStreak || 0
            });
            
           
            let isLive = false;

            try {

                const setting = {
                    timeout: {value: 100000},
                    khangBm: {value: false},
                    proxy: {value: 'httpProxy'},
                    userAgent: {value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0'}
                }

                await runInsta({
                    setting,
                    type: 'instagram',
                    mode: 'normal',
                    item: {
                        id: currentAccount._id,
                        uid: currentAccount.uid,
                        password: currentAccount.password,
                        twofa: currentAccount.twofa,
                        proxyKey: '42.115.87.255:46603:qXhlkJ:haoEBF'
                    }
                }, (action, data) => {

                    if (action === 'message' && data.message === 'Đăng nhập thành công') {

                        isLive = true

                    }

                })


            } catch (err) {

                throw new Error(err);
                
            }

            return { isLive, checkedAt: new Date() }; 
        }
    }));

    checkLiveRunner.addTasks(tasks);

    checkLiveRunner.on('task:complete', async ({ result, taskWrapper }) => {
        const { isLive, checkedAt } = result;
        const accountId = taskWrapper.id;
        const account = await Account.findById(accountId);
        if (!account) return;

        const updateData = { lastCheckedAt: checkedAt };
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
    
    checkLiveRunner.on('end', () => {
        console.log('[CheckLiveService] Tất cả các task check live đã hoàn thành.');
        io.emit('checklive:end', { message: 'Tiến trình Check Live đã hoàn tất.' });
    });

    checkLiveRunner.start();
}

module.exports = { runCheckLive };