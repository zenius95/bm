// utils/checkLiveService.js
const Account = require('../models/Account');
const Proxy = require('../models/Proxy'); // Import Proxy model
const ProcessRunner = require('./processRunner');
const InstagramAuthenticator = require('./instagramAuthenticator');
const { HttpsProxyAgent } = require('https-proxy-agent');
const fetch = require('node-fetch');

// Helper function to check if a single proxy is live
async function isProxyLive(proxyString) {
    if (!proxyString) return false;
    try {
        const agent = new HttpsProxyAgent(proxyString);
        // Sử dụng một API endpoint nhẹ và nhanh để kiểm tra
        const response = await fetch('https://api.ipify.org?format=json', { agent, timeout: 10000 });
        return response.ok;
    } catch (error) {
        console.warn(`[CheckLiveService] Proxy check failed for ${proxyString}: ${error.message}`);
        return false;
    }
}

/**
 * Dịch vụ kiểm tra trạng thái live của các account.
 * @param {string[]} accountIds - Mảng các ID của account cần kiểm tra.
 * @param {import('socket.io').Server} io - Instance của Socket.IO server để gửi sự kiện.
 * @param {object} options - Các tùy chọn cho ProcessRunner.
 */
async function runCheckLive(accountIds, io, options) {
    if (!accountIds || accountIds.length === 0) {
        console.log('[CheckLiveService] Không có account nào để kiểm tra.');
        return;
    }

    console.log(`[CheckLiveService] Bắt đầu tiến trình check live cho ${accountIds.length} accounts.`);

    const checkLiveRunner = new ProcessRunner({
        concurrency: options.concurrency || 10,
        delay: options.delay || 500,
        timeout: options.timeout || 180000,
        retries: 0,
        maxErrors: 0,
    });

    const tasks = accountIds.map(accountId => ({
        id: accountId,
        task: async () => {
            const currentAccount = await Account.findById(accountId);
            if (!currentAccount) throw new Error(`Account không tồn tại: ${accountId}`);

            await Account.findByIdAndUpdate(accountId, { status: 'CHECKING' });
            io.emit('account:update', {
                id: accountId,
                status: 'CHECKING',
                dieStreak: currentAccount.dieStreak || 0
            });

            let assignedProxy = null;

            // Logic tìm và gán proxy
            if (currentAccount.proxy) {
                console.log(`[ProxyLogic] Account ${currentAccount.uid} đã có proxy. Kiểm tra...`);
                const live = await isProxyLive(currentAccount.proxy);
                if (live) {
                    console.log(`[ProxyLogic] Proxy ${currentAccount.proxy} vẫn LIVE.`);
                    assignedProxy = currentAccount.proxy;
                } else {
                    console.log(`[ProxyLogic] Proxy ${currentAccount.proxy} đã DIE. Tìm proxy mới...`);
                    // Ném proxy cũ vào thùng rác
                    await Proxy.updateOne({ proxyString: currentAccount.proxy }, { isDeleted: true, deletedAt: new Date(), status: 'DEAD', assignedTo: null });
                    await currentAccount.updateOne({ proxy: '' }); // Xóa proxy khỏi account
                }
            }

            if (!assignedProxy) {
                 console.log(`[ProxyLogic] Account ${currentAccount.uid} chưa có proxy hoặc proxy cũ đã die. Đang tìm proxy mới...`);
                 let foundProxy = false;
                 // Vòng lặp để tìm proxy sống
                 while(!foundProxy) {
                    // Tìm proxy AVAILABLE, chưa gán, check gần nhất và gán ngay lập tức
                    const availableProxy = await Proxy.findOneAndUpdate(
                        { status: 'AVAILABLE', isDeleted: false, assignedTo: null },
                        { $set: { assignedTo: currentAccount._id, status: 'ASSIGNED' } },
                        { new: true, sort: { lastCheckedAt: -1 } }
                    );

                    if (availableProxy) {
                         console.log(`[ProxyLogic] Đã tìm thấy proxy ${availableProxy.proxyString}. Kiểm tra lại...`);
                         const live = await isProxyLive(availableProxy.proxyString);
                         if(live) {
                            assignedProxy = availableProxy.proxyString;
                            await currentAccount.updateOne({ proxy: assignedProxy });
                             console.log(`[ProxyLogic] Proxy ${assignedProxy} LIVE. Đã gán cho account ${currentAccount.uid}.`);
                            foundProxy = true; // Thoát khỏi vòng lặp
                         } else {
                             console.log(`[ProxyLogic] Proxy ${availableProxy.proxyString} DIE khi kiểm tra lại. Ném vào thùng rác...`);
                             await Proxy.updateOne({ _id: availableProxy._id }, { isDeleted: true, deletedAt: new Date(), status: 'DEAD', assignedTo: null });
                             // Vòng lặp sẽ tiếp tục để tìm proxy khác
                         }
                    } else {
                        // Nếu không còn proxy nào trong DB
                        console.log(`[ProxyLogic] Không còn proxy nào khả dụng.`);
                        throw new Error(`Không tìm thấy proxy nào khả dụng cho account ${currentAccount.uid}`);
                    }
                 }
            }

            let isLive = false;
            const credentials = {
                username: currentAccount.uid,
                password: currentAccount.password,
                twofa: currentAccount.twofa,
                proxy: assignedProxy // Sử dụng proxy đã được gán
            };

            const ig = new InstagramAuthenticator(credentials);

            try {
                await ig.login();
                isLive = true
            } catch (error) {
                 if (error instanceof CheckpointError) {
                    console.error("Lý do: Tài khoản bị checkpoint.");
                    console.error("URL xác thực:", error.checkpointUrl);
                } else if (error instanceof InvalidCredentialsError) {
                    console.error("Lý do: Sai thông tin đăng nhập.");
                } else if (error instanceof TwoFactorError) {
                    console.error("Lý do: Lỗi xác thực hai yếu tố.");
                } else {
                   throw new Error(error);
                }
            }

            // Nếu check live thất bại, giải phóng proxy để account khác dùng
            if (!isLive) {
                console.log(`[ProxyLogic] Account ${currentAccount.uid} DIE. Giải phóng proxy ${assignedProxy}...`);
                 await Proxy.updateOne({ proxyString: assignedProxy }, { $set: { assignedTo: null, status: 'AVAILABLE' } });
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
            // Giải phóng proxy khi account bị xóa
            if (account.proxy) {
                 await Proxy.updateOne({ proxyString: account.proxy }, { $set: { assignedTo: null, status: 'AVAILABLE' } });
            }
            await Account.findByIdAndUpdate(accountId, updateData);
            io.emit('account:trashed', { id: accountId, message: `Account ${account.uid} đã bị xóa do die 5 lần liên tiếp.` });
        } else {
            await Account.findByIdAndUpdate(accountId, updateData);
            io.emit('account:update', {
                id: accountId,
                status: updateData.status,
                lastCheckedAt: checkedAt.toLocaleString('vi-VN'),
                dieStreak: updateData.dieStreak,
                proxy: account.proxy // Gửi cả thông tin proxy về client
            });
        }
    });

     checkLiveRunner.on('task:error', async ({ error, taskWrapper }) => {
        console.error(`Lỗi không thể thử lại với account ID ${taskWrapper.id}: ${error.message}`);
        const account = await Account.findById(taskWrapper.id);
        if (account) {
            // Giải phóng proxy khi có lỗi
            if (account.proxy) {
                 await Proxy.updateOne({ proxyString: account.proxy }, { $set: { assignedTo: null, status: 'AVAILABLE' } });
            }
             const updatedAccount = await Account.findByIdAndUpdate(taskWrapper.id, { status: 'ERROR', proxy: '' }, { new: true }).lean();
             if (updatedAccount) {
                 io.emit('account:update', {
                    id: taskWrapper.id,
                    status: 'ERROR',
                    dieStreak: updatedAccount.dieStreak
                });
            }
        }
    });
    
    checkLiveRunner.on('end', () => {
        console.log('[CheckLiveService] Tất cả các task check live đã hoàn thành.');
        io.emit('checklive:end', { message: 'Tiến trình Check Live đã hoàn tất.' });
    });

    checkLiveRunner.start();
}

module.exports = { runCheckLive };