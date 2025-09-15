// utils/checkLiveService.js
const Account = require('../models/Account');
const ProcessRunner = require('./processRunner');
// Giả sử các hàm này tồn tại ở core, nếu không Bro cần điều chỉnh lại đường dẫn
// const { delayTimeout, getSetting } = require('../../src.core.js'); 
// const runInsta = require('../../src.runInsta.js');

/**
 * Dịch vụ kiểm tra trạng thái live của các account.
 * @param {string[]} accountIds - Mảng các ID của account cần kiểm tra.
 * @param {import('socket.io').Server} io - Instance của Socket.IO server để gửi sự kiện.
 */
async function runCheckLive(accountIds, io) {
    if (!accountIds || accountIds.length === 0) {
        console.log('[CheckLiveService] Không có account nào để kiểm tra.');
        return;
    }

    console.log(`[CheckLiveService] Bắt đầu tiến trình check live cho ${accountIds.length} accounts.`);

    const checkLiveRunner = new ProcessRunner({
        concurrency: 10, // Số luồng check đồng thời
        delay: 500,
        retries: 2,
        timeout: 45000,
        maxErrors: 20,
    });

    const tasks = accountIds.map(accountId => ({
        id: accountId,
        task: async () => {
            const currentAccount = await Account.findById(accountId).lean();
            if (!currentAccount) throw new Error(`Account không tồn tại: ${accountId}`);

            // Cập nhật trạng thái sang CHECKING và thông báo qua socket
            await Account.findByIdAndUpdate(accountId, { status: 'CHECKING' });
            io.emit('account:update', { 
                id: accountId, 
                status: 'CHECKING',
                dieStreak: currentAccount.dieStreak || 0
            });
            
            // --- LOGIC CHECK LIVE THỰC TẾ ---
            // Bro hãy thay thế phần giả lập này bằng logic check live thật của mình.
            // Ví dụ: gọi hàm runInsta
            await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 3000));
            if (Math.random() < 0.15) { // Giả lập lỗi ngẫu nhiên
                throw new Error("Lỗi ngẫu nhiên khi check live");
            }
            const isLive = Math.random() > 0.5; // Giả lập kết quả LIVE/DIE
            // --- KẾT THÚC LOGIC CHECK LIVE ---

            // try {

            //     const setting = {
            //         timeout: {value: 100000},
            //         khangBm: {value: false},
            //         userAgent: {value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0'}
            //     }

            //     await runInsta({
            //         setting,
            //         type: 'instagram',
            //         mode: 'normal',
            //         item: {
            //             id: currentAccount._id,
            //             uid: currentAccount.uid,
            //             password: currentAccount.password,
            //             twofa: currentAccount.twofa,
            //             proxyKey: ''
            //         }
            //     }, (action, data) => {

            //         console.log(action, data)

            //         if (action === 'message' && data.message === 'Đăng nhập thành công') {

            //             isLive = true

            //         }

            //     })


            // } catch (err) {

            //     console.log(err)

            //     throw new Error(err);
            // }

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