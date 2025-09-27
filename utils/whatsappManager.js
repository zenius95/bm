// utils/whatsappManager.js
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const Whatsapp = require('../models/Whatsapp');
const fs = require('fs/promises');
const path = require('path');

class WhatsappManager {
    constructor() {
        this.clients = new Map();
        this.io = null;
        this.sessionsBeingProcessed = new Set();
    }

    initialize(io) {
        this.io = io;
        console.log('🔄 Initializing WhatsApp Manager...');
    }

    initializeClient(sessionId, io) {
        if (this.clients.has(sessionId)) {
            console.log(`[WhatsappManager] Client cho phiên ${sessionId} đã tồn tại.`);
            return;
        }

        console.log(`[WhatsappManager] Đang khởi tạo client cho phiên: ${sessionId}`);
        const client = new Client({
            authStrategy: new LocalAuth({ clientId: sessionId }),
            puppeteer: {
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            }
        });

        client.on('qr', async (qr) => {
            console.log(`[WhatsappManager] Đã nhận mã QR cho ${sessionId}`);
            try {
                const qrDataURL = await qrcode.toDataURL(qr);
                io.emit('whatsapp:qr', { sessionId, qrDataURL });
            } catch (err) {
                console.error(`[WhatsappManager] Lỗi tạo QR data URL cho ${sessionId}:`, err);
            }
        });

        client.on('ready', async () => {
            if (this.sessionsBeingProcessed.has(sessionId)) {
                console.log(`[WhatsappManager] Bỏ qua sự kiện 'ready' trùng lặp cho phiên ${sessionId}.`);
                return;
            }
            try {
                this.sessionsBeingProcessed.add(sessionId);
                console.log(`[WhatsappManager] Client cho phiên ${sessionId} đã sẵn sàng!`);
                const clientInfo = client.info;
                const phoneNumber = clientInfo.wid.user;
                const newOrUpdatedSession = await Whatsapp.findOneAndUpdate(
                    { sessionId: sessionId },
                    { $set: { phoneNumber: phoneNumber, status: 'CONNECTED' } },
                    { new: true, upsert: true }
                );
                io.emit('whatsapp:session_created', newOrUpdatedSession);
            } catch (error) {
                 console.error(`[WhatsappManager] Lỗi trong sự kiện 'ready' cho phiên ${sessionId}:`, error);
            } finally {
                this.sessionsBeingProcessed.delete(sessionId);
            }
        });
        
        // --- START: THÊM BỘ LẮNG NGHE TIN NHẮN MỚI ---
        client.on('message', message => {
            console.log(`[WhatsappManager] Tin nhắn mới từ ${message.from}: ${message.body}`);
            // Ở đây bro có thể thêm logic để đẩy notification qua websocket nếu muốn
            // Ví dụ: io.emit('whatsapp:new_message', { sessionId, message });
        });
        // --- END: THÊM BỘ LẮNG NGHE TIN NHẮN MỚI ---

        client.on('disconnected', async (reason) => {
            console.log(`[WhatsappManager] Client ${sessionId} đã bị đăng xuất:`, reason);
            await Whatsapp.findOneAndUpdate({ sessionId }, { status: 'DISCONNECTED' });
            this.clients.delete(sessionId);
            io.emit('whatsapp:update', { id: sessionId, status: 'DISCONNECTED' });
            const sessionPath = path.join(__dirname, '..', '.wwebjs_auth', `session-${sessionId}`);
            try {
                await fs.rm(sessionPath, { recursive: true, force: true });
                console.log(`[WhatsappManager] Đã dọn dẹp thư mục session cho ${sessionId}`);
            } catch (error) {
                console.error(`[WhatsappManager] Lỗi dọn dẹp thư mục session cho ${sessionId}:`, error);
            }
        });

        client.initialize().catch(err => {
            console.error(`[WhatsappManager] Lỗi khởi tạo client ${sessionId}:`, err);
             io.emit('whatsapp:init_failed', { sessionId, message: err.message });
        });
        
        this.clients.set(sessionId, client);
    }
    
    async sendMessage(sessionId, number, message) {
        const client = this.clients.get(sessionId);
        if (!client) {
            throw new Error('Phiên không tồn tại hoặc chưa được khởi tạo.');
        }
        const clientState = await client.getState();
        if (clientState !== 'CONNECTED') {
            throw new Error('Client chưa sẵn sàng. Vui lòng đợi kết nối.');
        }
        const chatId = `${number.replace(/\D/g, '')}@c.us`;
        try {
            const msgResponse = await client.sendMessage(chatId, message);
            console.log(`[WhatsappManager] Đã gửi tin nhắn thành công tới ${chatId}`);
            return msgResponse;
        } catch (error) {
            console.error(`[WhatsappManager] Lỗi khi gửi tin nhắn tới ${chatId}:`, error);
            throw new Error(`Không thể gửi tin nhắn. Lỗi: ${error.message}`);
        }
    }

    async destroyClient(sessionId) {
        const client = this.clients.get(sessionId);
        if (client) {
            try {
                await client.destroy();
                console.log(`[WhatsappManager] Client ${sessionId} đã được hủy.`);
            } catch (error) {
                console.error(`[WhatsappManager] Lỗi khi hủy client ${sessionId}:`, error);
            } finally {
                this.clients.delete(sessionId);
                const sessionPath = path.join(__dirname, '..', '.wwebjs_auth', `session-${sessionId}`);
                try {
                    await fs.rm(sessionPath, { recursive: true, force: true });
                    console.log(`[WhatsappManager] Đã dọn dẹp thư mục session cho ${sessionId} sau khi hủy.`);
                } catch (error) {
                    console.error(`[WhatsappManager] Lỗi dọn dẹp thư mục session cho ${sessionId} sau khi hủy:`, error);
                }
            }
        }
    }
}

module.exports = new WhatsappManager();