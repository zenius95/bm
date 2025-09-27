/**
 * File test để lắng nghe tin nhắn WhatsApp.
 * * CÁCH SỬ DỤNG:
 * 1. Đảm bảo bạn đã có ít nhất một phiên WhatsApp đang ở trạng thái "CONNECTED" trong trang Admin.
 * 2. Mở một terminal mới trong thư mục gốc của dự án.
 * 3. Chạy lệnh: node test/test_whatsapp_message.js
 * 4. Script sẽ tìm phiên WhatsApp đầu tiên đang hoạt động và kết nối lại.
 * 5. Gửi một tin nhắn đến số điện thoại của phiên WhatsApp đó từ một số khác.
 * 6. Bạn sẽ thấy nội dung tin nhắn được in ra trong terminal.
 * 7. Nhấn CTRL + C để dừng script.
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const mongoose = require('mongoose');
const qrcode = require('qrcode-terminal');
const config = require('../config'); // Import config để lấy chuỗi kết nối DB
const Whatsapp = require('../models/Whatsapp'); // Import model Whatsapp

async function runTest() {
    console.log('--- BẮT ĐẦU TEST NHẬN TIN NHẮN WHATSAPP ---');

    // Kết nối tới database
    try {
        await mongoose.connect(config.mongodb.uri);
        console.log('✅ Kết nối MongoDB thành công.');
    } catch (error) {
        console.error('❌ Không thể kết nối tới MongoDB. Vui lòng kiểm tra lại chuỗi kết nối.', error);
        return;
    }

    // Tìm một phiên đã kết nối để test
    console.log('🔍 Đang tìm một phiên WhatsApp đã kết nối...');
    const connectedSession = await Whatsapp.findOne({ status: 'CONNECTED', isDeleted: false });

    if (!connectedSession) {
        console.error('❌ Không tìm thấy phiên WhatsApp nào đang ở trạng thái "CONNECTED".');
        console.log('Vui lòng vào trang Admin, thêm một phiên và quét mã QR trước khi chạy test.');
        await mongoose.disconnect();
        return;
    }

    const sessionIdToTest = connectedSession.sessionId;
    console.log(`👍 Đã tìm thấy phiên: ${sessionIdToTest} (SĐT: ${connectedSession.phoneNumber})`);
    console.log('🚀 Đang khởi tạo client...');

    // Khởi tạo client với session đã tìm thấy
    const client = new Client({
        authStrategy: new LocalAuth({ clientId: sessionIdToTest }),
        puppeteer: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        }
    });

    client.on('qr', () => {
        // Nếu nó yêu cầu QR, nghĩa là session đã hỏng, không thể test
        console.error('❌ Session đã hết hạn. Vui lòng xóa phiên này trong Admin và tạo lại.');
        mongoose.disconnect();
    });

    client.on('ready', () => {
        console.log('✅ Client đã sẵn sàng!');
        console.log('---');
        console.log('👂 ĐANG LẮNG NGHE TIN NHẮN MỚI...');
        console.log('---');
        console.log('Bây giờ, hãy dùng một điện thoại khác và gửi tin nhắn tới số:', connectedSession.phoneNumber);
        console.log('(Nhấn CTRL + C để thoát)');
    });

    client.on('message', message => {
        console.log('\n-----------------------------------------');
        console.log('📬 CÓ TIN NHẮN MỚI!');
        console.log(`   - Từ: ${message.from}`);
        console.log(`   - Tới: ${message.to}`);
        console.log(`   - Nội dung: "${message.body}"`);
        console.log('-----------------------------------------\n');

        // Tự động trả lời để xác nhận
        if (!message.fromMe) { // Chỉ trả lời nếu tin nhắn không phải từ chính mình
            message.reply('🤖 [Auto-Reply] Đã nhận được tin nhắn của bạn!');
        }
    });

    client.on('disconnected', (reason) => {
        console.log('❌ Client đã bị ngắt kết nối:', reason);
        mongoose.disconnect();
    });

    client.initialize().catch(err => {
        console.error('Lỗi khi khởi tạo client:', err);
        mongoose.disconnect();
    });
}

runTest();