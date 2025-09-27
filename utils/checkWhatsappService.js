// utils/checkWhatsappService.js
const { Client, LocalAuth } = require('whatsapp-web.js');
const Whatsapp = require('../models/Whatsapp');

// Hàm kiểm tra một phiên WhatsApp duy nhất
async function checkSingleWhatsapp(sessionId) {
    return new Promise((resolve) => {
        let client;
        let timeout;

        // Hàm dọn dẹp để đảm bảo client và timeout được hủy
        const cleanup = async (status, clientInstance) => {
            clearTimeout(timeout);
            if (clientInstance) {
                try {
                    await clientInstance.destroy();
                } catch (e) {
                    // Bỏ qua lỗi khi hủy client
                }
            }
            resolve({ isLive: status, checkedAt: new Date() });
        };

        try {
            client = new Client({
                authStrategy: new LocalAuth({ clientId: sessionId }),
                puppeteer: {
                    headless: true,
                    args: ['--no-sandbox', '--disable-setuid-sandbox']
                }
            });

            // Nếu client không sẵn sàng trong 30 giây, coi như là DIE
            timeout = setTimeout(() => cleanup(false, client), 30000);

            // Nếu yêu cầu quét QR, nghĩa là session cũ không còn hợp lệ -> DIE
            client.once('qr', () => cleanup(false, client));

            // Nếu kết nối thành công -> LIVE
            client.once('ready', () => cleanup(true, client));

            // Nếu bị ngắt kết nối -> DIE
            client.once('disconnected', () => cleanup(false, client));

            client.initialize().catch(() => cleanup(false, client));

        } catch (error) {
            console.error(`[CheckWhatsappService] Lỗi nghiêm trọng khi kiểm tra session ${sessionId}: ${error.message}`);
            cleanup(false, client);
        }
    });
}


async function runCheckWhatsapp(whatsappIds, io, options = {}) {
    if (!whatsappIds || whatsappIds.length === 0) return;

    console.log(`[CheckWhatsappService] Bắt đầu kiểm tra ${whatsappIds.length} phiên WhatsApp.`);
    io.emit('checkwhatsapp:start', { total: whatsappIds.length });

    for (const whatsappId of whatsappIds) {
        const session = await Whatsapp.findById(whatsappId);
        if (!session || session.isDeleted) continue;

        try {
            await Whatsapp.findByIdAndUpdate(whatsappId, {
                status: 'LOADING', // Dùng trạng thái LOADING để biểu thị đang check
                previousStatus: session.status
            });
            io.emit('whatsapp:update', { id: session.sessionId, status: 'LOADING' });

            const { isLive, checkedAt } = await checkSingleWhatsapp(session.sessionId);

            const finalStatus = isLive ? 'CONNECTED' : 'DISCONNECTED';
            await Whatsapp.findByIdAndUpdate(whatsappId, {
                status: finalStatus,
                lastCheckedAt: checkedAt,
                previousStatus: null
            });

            io.emit('whatsapp:update', {
                id: session.sessionId,
                status: finalStatus,
                lastCheckedAt: checkedAt.toLocaleString('vi-VN')
            });

        } catch (error) {
            console.error(`[CheckWhatsappService] Lỗi khi xử lý phiên ${session.sessionId}:`, error);
            await Whatsapp.findByIdAndUpdate(whatsappId, {
                status: 'DISCONNECTED', // Nếu có lỗi không xác định, coi như là Disconnected
                lastCheckedAt: new Date(),
                previousStatus: null
            });
            io.emit('whatsapp:update', { id: session.sessionId, status: 'DISCONNECTED' });
        }
    }

    console.log('[CheckWhatsappService] Hoàn thành kiểm tra tất cả các phiên WhatsApp.');
    io.emit('checkwhatsapp:end', { message: 'Đã hoàn thành kiểm tra WhatsApp.' });
}

module.exports = { runCheckWhatsapp };