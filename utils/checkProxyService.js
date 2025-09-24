// utils/checkProxyService.js
const Proxy = require('../models/Proxy');
const Account = require('../models/Account');
const ProcessRunner = require('./processRunner');
const fetch = require('node-fetch');
const { HttpsProxyAgent } = require('https-proxy-agent');

const PROXY_CHECK_APIS = [
    'https://api.ipify.org?format=json',
    'https://httpbin.org/ip',
    'https://ipinfo.io/json'
];

async function checkSingleProxy(proxyString) {
    const agent = new HttpsProxyAgent(proxyString);
    
    for (const apiUrl of PROXY_CHECK_APIS) {
        try {
            const response = await fetch(apiUrl, {
                agent,
                timeout: 15000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });

            if (response.ok) {
                console.log(`✅ Proxy ${proxyString} hoạt động tốt qua API: ${apiUrl}`);
                return { isLive: true, checkedAt: new Date() };
            }
        } catch (error) {
            console.warn(`⚠️ Lỗi khi kiểm tra proxy ${proxyString} với API ${apiUrl}: ${error.message}. Thử API tiếp theo...`);
        }
    }

    console.error(`❌ Proxy ${proxyString} không hoạt động với tất cả các API.`);
    return { isLive: false, checkedAt: new Date() };
}

async function runCheckProxy(proxyIds, io, options) {
    if (!proxyIds || proxyIds.length === 0) {
        return;
    }
    console.log(`[CheckProxyService] Bắt đầu tiến trình kiểm tra cho ${proxyIds.length} proxy.`);

    const checkProxyRunner = new ProcessRunner({
        concurrency: options.concurrency || 5,
        delay: options.delay || 200,
        timeout: options.timeout || 20000,
        retries: options.retries || 0, // <<< THÊM DÒNG NÀY
    });

    const tasks = proxyIds.map(proxyId => ({
        id: proxyId,
        task: async () => {
            const originalProxy = await Proxy.findById(proxyId).lean();
            if (!originalProxy) throw new Error(`Không tìm thấy proxy: ${proxyId}`);

            await Proxy.findByIdAndUpdate(proxyId, { 
                status: 'CHECKING',
                previousStatus: originalProxy.status
            });

            io.emit('proxy:update', { id: proxyId, status: 'CHECKING' });
            
            const checkResult = await checkSingleProxy(originalProxy.proxyString);
            
            return { ...checkResult, originalProxy };
        }
    }));

    checkProxyRunner.addTasks(tasks);

    checkProxyRunner.on('task:complete', async ({ result, taskWrapper }) => {
        const { isLive, checkedAt, originalProxy } = result;
        const proxyId = taskWrapper.id;
        
        let updateData = { lastCheckedAt: checkedAt, previousStatus: null };

        if (isLive) {
            updateData.status = 'AVAILABLE';
        } else {
            updateData.status = 'DEAD';
            updateData.isDeleted = true;
            updateData.deletedAt = new Date();

            console.log(`Proxy ${originalProxy.proxyString} DIE, gỡ khỏi tất cả các account đang dùng.`);
            await Account.updateMany({ proxy: originalProxy.proxyString }, { $set: { proxy: '' } });
        }

        await Proxy.findByIdAndUpdate(proxyId, updateData);
        
        if (updateData.isDeleted) {
            const newTrashCount = await Proxy.countDocuments({ isDeleted: true });
            io.emit('proxies:trash:update', { newTrashCount });
            io.emit('proxy:trashed', { id: proxyId, message: `Proxy ${proxyId.slice(-6)} đã bị chuyển vào thùng rác do không hoạt động.` });
        } else {
            io.emit('proxy:update', {
                id: proxyId,
                status: updateData.status,
                lastCheckedAt: checkedAt.toLocaleString('vi-VN')
            });
        }
    });

    checkProxyRunner.on('task:error', async ({ error, taskWrapper }) => {
        console.error(`Lỗi khi kiểm tra Proxy ID ${taskWrapper.id}: ${error.message}`);
        
        const proxy = await Proxy.findById(taskWrapper.id).lean();
        if (!proxy) return;

        await Account.updateMany({ proxy: proxy.proxyString }, { $set: { proxy: '' } });
        
        const updateData = { 
            status: 'DEAD', 
            lastCheckedAt: new Date(),
            isDeleted: true,
            deletedAt: new Date(),
            previousStatus: null
        };
        await Proxy.findByIdAndUpdate(taskWrapper.id, updateData);

        const proxyIdString = taskWrapper.id.toString(); 

        const newTrashCount = await Proxy.countDocuments({ isDeleted: true });
        io.emit('proxies:trash:update', { newTrashCount });
        io.emit('proxy:trashed', { id: taskWrapper.id, message: `Proxy ${proxyIdString.slice(-6)} bị lỗi và đã được chuyển vào thùng rác.` });
    });
    
    checkProxyRunner.on('end', () => {
        console.log('[CheckProxyService] Tất cả các task kiểm tra proxy đã hoàn thành.');
        io.emit('checkproxy:end', { message: 'Tiến trình kiểm tra proxy đã kết thúc.' });
    });

    checkProxyRunner.start();
}

module.exports = { runCheckProxy };