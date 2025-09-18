// utils/checkLiveService.js
const Account = require('../models/Account');
const Proxy = require('../models/Proxy');
const ProcessRunner = require('./processRunner');
// Import các lớp Error tùy chỉnh để phân loại lỗi
const InstagramAuthenticator = require('./instagramAuthenticator');
const { CheckpointError, InvalidCredentialsError, TwoFactorError } = require('./instagramAuthenticator');
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
    let assignedProxyString = null;
    let attempts = 0;
    const maxAttempts = 5;

    while (!assignedProxyString && attempts < maxAttempts) {
        attempts++;
        // Tìm proxy AVAILABLE được sử dụng ít nhất gần đây và cập nhật thời gian sử dụng
        const availableProxy = await Proxy.findOneAndUpdate(
            { status: 'AVAILABLE', isDeleted: false },
            { $set: { lastUsedAt: new Date() } },
            { new: true, sort: { lastUsedAt: 1 } } // Sắp xếp theo lastUsedAt tăng dần
        );

        if (availableProxy) {
            console.log(`[ProxyLogic] Đã tìm thấy proxy ${availableProxy.proxyString}. Kiểm tra lại...`);
            const live = await isProxyLive(availableProxy.proxyString);
            if (live) {
                assignedProxyString = availableProxy.proxyString;
                await currentAccount.updateOne({ proxy: assignedProxyString });
                console.log(`[ProxyLogic] Proxy ${assignedProxyString} LIVE. Đã gán cho account ${currentAccount.uid}.`);
            } else {
                console.log(`[ProxyLogic] Proxy ${availableProxy.proxyString} DIE khi kiểm tra lại. Ném vào thùng rác...`);
                await Proxy.updateOne({ _id: availableProxy._id }, { isDeleted: true, deletedAt: new Date(), status: 'DEAD' });
            }
        } else {
            console.log(`[ProxyLogic] Không còn proxy nào khả dụng.`);
            break; 
        }
    }

    if (!assignedProxyString) {
        throw new Error(`Không tìm thấy proxy nào khả dụng cho account ${currentAccount.uid} sau ${attempts} lần thử.`);
    }
    return assignedProxyString;
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

            await Account.findByIdAndUpdate(accountId, { 
                status: 'CHECKING',
                previousStatus: currentAccount.status 
            });
            
            io.emit('account:update', { id: accountId, status: 'CHECKING', dieStreak: currentAccount.dieStreak || 0 });

            let assignedProxy = currentAccount.proxy;

            if (assignedProxy) {
                const proxyInDb = await Proxy.findOne({ proxyString: assignedProxy, isDeleted: false }).lean();
                if (!proxyInDb) {
                    console.log(`[ProxyCleanup] Proxy ${assignedProxy} không còn tồn tại. Xóa khỏi account ${currentAccount.uid}.`);
                    await currentAccount.updateOne({ proxy: '' });
                    assignedProxy = null; 
                }
            }
            
            if (assignedProxy) {
                console.log(`[ProxyLogic] Account ${currentAccount.uid} đã có proxy. Kiểm tra...`);
                const live = await isProxyLive(assignedProxy);
                if (!live) {
                    console.log(`[ProxyLogic] Proxy ${assignedProxy} đã DIE. Tìm proxy mới...`);
                    await Proxy.updateOne({ proxyString: assignedProxy }, { isDeleted: true, deletedAt: new Date(), status: 'DEAD' });
                    await currentAccount.updateOne({ proxy: '' });
                    assignedProxy = await acquireProxyForAccount(currentAccount);
                } else {
                    console.log(`[ProxyLogic] Proxy ${assignedProxy} vẫn LIVE.`);
                }
            } else {
                assignedProxy = await acquireProxyForAccount(currentAccount);
            }

            const credentials = {
                username: currentAccount.uid,
                password: currentAccount.password,
                twofa: currentAccount.twofa,
                proxy: assignedProxy
            };

            const ig = new InstagramAuthenticator(credentials);

            // === START: LOGIC BẮT LỖI VÀ PHÂN LOẠI MỚI ===
            try {
                await ig.login();
                // Nếu login thành công, trả về trạng thái LIVE
                return { finalStatus: 'LIVE', checkedAt: new Date() };
            } catch (error) {
                 // Nếu là các lỗi xác thực cụ thể, coi là DIE
                 if (error instanceof CheckpointError || error instanceof InvalidCredentialsError || error instanceof TwoFactorError) {
                    console.error(`Lỗi đăng nhập (DIE) cho ${currentAccount.uid}: ${error.message}`);
                    return { finalStatus: 'DIE', checkedAt: new Date() };
                } else {
                   // Các lỗi khác (timeout, proxy, mạng...) thì ném ra để ProcessRunner coi là ERROR
                   throw error;
                }
            }
            // === END: LOGIC BẮT LỖI VÀ PHÂN LOẠI MỚI ===
        }
    }));
    
    checkLiveRunner.addTasks(tasks);

    // === START: LOGIC XỬ LÝ KẾT QUẢ MỚI ===
    checkLiveRunner.on('task:complete', async ({ result, taskWrapper }) => {
        const { finalStatus, checkedAt } = result;
        const accountId = taskWrapper.id;
        const account = await Account.findById(accountId);
        if (!account) return;

        const updateData = { lastCheckedAt: checkedAt, previousStatus: null };

        if (finalStatus === 'LIVE') {
            updateData.status = 'LIVE';
            updateData.dieStreak = 0; // Reset die streak khi thành công
            await Account.findByIdAndUpdate(accountId, updateData);
            io.emit('account:update', {
                id: accountId,
                status: updateData.status,
                lastCheckedAt: checkedAt.toLocaleString('vi-VN'),
                dieStreak: updateData.dieStreak,
                proxy: account.proxy
            });
        } else if (finalStatus === 'DIE') {
            // Nếu là DIE, chuyển thẳng vào thùng rác
            updateData.status = 'DIE';
            updateData.isDeleted = true;
            updateData.deletedAt = new Date();
            await Account.findByIdAndUpdate(accountId, updateData);
            io.emit('account:trashed', { id: accountId, message: `Account ${account.uid} đã DIE (Checkpoint/Sai pass) và được chuyển vào thùng rác.` });
        }
    });
    // === END: LOGIC XỬ LÝ KẾT QUẢ MỚI ===

    // Logic xử lý lỗi (task:error) giữ nguyên, vì nó đã xử lý đúng trường hợp ERROR
    checkLiveRunner.on('task:error', async ({ error, taskWrapper }) => {
        console.error(`Lỗi (ERROR) với account ID ${taskWrapper.id}: ${error.message}`);
        const account = await Account.findById(taskWrapper.id);
        if (!account) return;

        const newDieStreak = (account.dieStreak || 0) + 1;
        const updateData = {
            status: 'ERROR',
            previousStatus: null,
            dieStreak: newDieStreak,
            lastCheckedAt: new Date()
        };

        if (newDieStreak >= 5) {
            updateData.isDeleted = true;
            updateData.deletedAt = new Date();
            await Account.findByIdAndUpdate(taskWrapper.id, updateData);
            io.emit('account:trashed', { id: taskWrapper.id, message: `Account ${account.uid} đã bị xóa do ERROR 5 lần liên tiếp.` });
        } else {
            await Account.findByIdAndUpdate(taskWrapper.id, updateData);
            io.emit('account:update', {
                id: taskWrapper.id,
                status: 'ERROR',
                lastCheckedAt: updateData.lastCheckedAt.toLocaleString('vi-VN'),
                dieStreak: newDieStreak,
                proxy: account.proxy
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