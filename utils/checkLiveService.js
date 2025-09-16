// utils/checkLiveService.js
const Account = require('../models/Account');
const Proxy = require('../models/Proxy');
const ProcessRunner = require('./processRunner');
const InstagramAuthenticator = require('./instagramAuthenticator');
const { HttpsProxyAgent } = require('https-proxy-agent');
const fetch = require('node-fetch');

async function isProxyLive(proxyString) {
    if (!proxyString) return false;
    try {
        const agent = new HttpsProxyAgent(proxyString);
        const response = await fetch('https://api.ipify.org?format=json', { agent, timeout: 10000 });
        return response.ok;
    } catch (error) {
        console.warn(`[CheckLiveService] Proxy check failed for ${proxyString}: ${error.message}`);
        return false;
    }
}

async function acquireProxyForAccount(currentAccount) {
    console.log(`[ProxyLogic] Bắt đầu tìm proxy cho account ${currentAccount.uid}...`);
    let assignedProxy = null;
    let attempts = 0;
    const maxAttempts = 5;

    while (!assignedProxy && attempts < maxAttempts) {
        attempts++;
        const availableProxy = await Proxy.findOneAndUpdate(
            { status: 'AVAILABLE', isDeleted: false, assignedTo: null },
            { $set: { assignedTo: currentAccount._id, status: 'ASSIGNED' } },
            { new: true, sort: { lastCheckedAt: -1 } }
        );

        if (availableProxy) {
            console.log(`[ProxyLogic] Đã tìm thấy proxy ${availableProxy.proxyString}. Kiểm tra lại...`);
            const live = await isProxyLive(availableProxy.proxyString);
            if (live) {
                assignedProxy = availableProxy.proxyString;
                await currentAccount.updateOne({ proxy: assignedProxy });
                console.log(`[ProxyLogic] Proxy ${assignedProxy} LIVE. Đã gán cho account ${currentAccount.uid}.`);
            } else {
                console.log(`[ProxyLogic] Proxy ${availableProxy.proxyString} DIE khi kiểm tra lại. Ném vào thùng rác...`);
                await Proxy.updateOne({ _id: availableProxy._id }, { isDeleted: true, deletedAt: new Date(), status: 'DEAD', assignedTo: null });
            }
        } else {
            console.log(`[ProxyLogic] Không còn proxy nào khả dụng.`);
            break; 
        }
    }

    if (!assignedProxy) {
        throw new Error(`Không tìm thấy proxy nào khả dụng cho account ${currentAccount.uid} sau ${attempts} lần thử.`);
    }
    return assignedProxy;
}

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
            io.emit('account:update', { id: accountId, status: 'CHECKING', dieStreak: currentAccount.dieStreak || 0 });

            let assignedProxy = currentAccount.proxy;

            // === START: THAY ĐỔI QUAN TRỌNG: Dọn dẹp proxy không tồn tại ===
            if (assignedProxy) {
                const proxyInDb = await Proxy.findOne({ proxyString: assignedProxy, isDeleted: false }).lean();
                if (!proxyInDb) {
                    console.log(`[ProxyCleanup] Proxy ${assignedProxy} không còn tồn tại. Xóa khỏi account ${currentAccount.uid}.`);
                    await currentAccount.updateOne({ proxy: '' });
                    assignedProxy = null; // Xóa để logic bên dưới tìm proxy mới
                }
            }
            // === END: THAY ĐỔI QUAN TRỌNG ===

            if (assignedProxy) {
                console.log(`[ProxyLogic] Account ${currentAccount.uid} đã có proxy. Kiểm tra...`);
                const live = await isProxyLive(assignedProxy);
                if (!live) {
                    console.log(`[ProxyLogic] Proxy ${assignedProxy} đã DIE. Tìm proxy mới...`);
                    await Proxy.updateOne({ proxyString: assignedProxy }, { isDeleted: true, deletedAt: new Date(), status: 'DEAD', assignedTo: null });
                    await currentAccount.updateOne({ proxy: '' });
                    assignedProxy = await acquireProxyForAccount(currentAccount);
                } else {
                    console.log(`[ProxyLogic] Proxy ${assignedProxy} vẫn LIVE.`);
                }
            } else {
                assignedProxy = await acquireProxyForAccount(currentAccount);
            }

            let isLive = false;
            const credentials = {
                username: currentAccount.uid,
                password: currentAccount.password,
                twofa: currentAccount.twofa,
                proxy: assignedProxy
            };

            const ig = new InstagramAuthenticator(credentials);

            try {
                await ig.login();
                isLive = true
            } catch (error) {
                 if (error instanceof CheckpointError || error instanceof InvalidCredentialsError || error instanceof TwoFactorError) {
                    console.error(`Lỗi đăng nhập cho ${currentAccount.uid}: ${error.message}`);
                } else {
                   throw error;
                }
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
                proxy: account.proxy
            });
        }
    });

     checkLiveRunner.on('task:error', async ({ error, taskWrapper }) => {
        console.error(`Lỗi không thể thử lại với account ID ${taskWrapper.id}: ${error.message}`);
        const account = await Account.findById(taskWrapper.id);
        if (account) {
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