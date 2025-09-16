// utils/checkProxyService.js
const Proxy = require('../models/Proxy');
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
        retries: 1,
    });

    const tasks = proxyIds.map(proxyId => ({
        id: proxyId,
        task: async () => {
            const currentProxy = await Proxy.findById(proxyId).lean();
            if (!currentProxy) throw new Error(`Không tìm thấy proxy: ${proxyId}`);

            await Proxy.findByIdAndUpdate(proxyId, { status: 'CHECKING' });
            io.emit('proxy:update', { id: proxyId, status: 'CHECKING' });
            
            return await checkSingleProxy(currentProxy.proxyString);
        }
    }));

    checkProxyRunner.addTasks(tasks);

    checkProxyRunner.on('task:complete', async ({ result, taskWrapper }) => {
        const { isLive, checkedAt } = result;
        const proxyId = taskWrapper.id;
        let updateData = { lastCheckedAt: checkedAt };

        if (isLive) {
            updateData.status = 'AVAILABLE';
        } else {
            // === THAY ĐỔI QUAN TRỌNG: NÉM PROXY DIE VÀO THÙNG RÁC ===
            updateData.status = 'DEAD';
            updateData.isDeleted = true;
            updateData.deletedAt = new Date();
        }

        await Proxy.findByIdAndUpdate(proxyId, updateData);
        
        if (updateData.isDeleted) {
            // Gửi sự kiện để giao diện xóa dòng proxy khỏi bảng
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
        const checkedAt = new Date();
        // Cập nhật trạng thái và ném vào thùng rác khi có lỗi
        const updateData = { 
            status: 'DEAD', 
            lastCheckedAt: checkedAt,
            isDeleted: true,
            deletedAt: new Date()
        };
        await Proxy.findByIdAndUpdate(taskWrapper.id, updateData);

        const newTrashCount = await Proxy.countDocuments({ isDeleted: true });
        io.emit('proxies:trash:update', { newTrashCount });
        io.emit('proxy:trashed', { id: taskWrapper.id, message: `Proxy ${taskWrapper.id.slice(-6)} bị lỗi và đã được chuyển vào thùng rác.` });
    });
    
    checkProxyRunner.on('end', () => {
        console.log('[CheckProxyService] Tất cả các task kiểm tra proxy đã hoàn thành.');
        io.emit('checkproxy:end', { message: 'Tiến trình kiểm tra proxy đã kết thúc.' });
    });

    checkProxyRunner.start();
}

module.exports = { runCheckProxy };