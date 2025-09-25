// insta/test.js
const { runAppealProcess } = require('../insta/runInsta.js');
const settingsService = require('../utils/settingsService');

// II. Chạy test
async function runTest() {
    // ---- THAY ĐỔI THÔNG TIN CỦA BRO VÀO ĐÂY ----
    const account = {
        uid: 'bzbfodgsn2',
        password: 'wisnR9tc7vXS',
        twofa: 'D4IA QGA2 MOIW PK5O 2C2J MMUE 6UHVLTA6',
        proxy: 'http://KoykSf:IiZXHY@171.224.206.184:18775'
    };
    const bmIdToAppeal = '1025522572375581';

    // ------------------------------------------

    console.log(`Bắt đầu test với account: ${account.uid} và BM ID: ${bmIdToAppeal}`);

    // Hàm callback để log tiến trình ra console
    const logCallback = (message) => {
        // Xóa bớt tag HTML cho dễ nhìn trên console
        const cleanMessage = message.replace(/<[^>]*>/g, '');
        console.log(`[LOG] ${cleanMessage}`);
    };

    try {
        // Khởi tạo settings trước khi chạy
        await settingsService.initialize();
        console.log("Khởi tạo Settings Service thành công.");

        const result = await runAppealProcess(account, bmIdToAppeal, logCallback);
        if (result) {
            console.log("\n✅ QUY TRÌNH HOÀN TẤT THÀNH CÔNG!");
        } else {
            console.log("\n❌ QUY TRÌNH THẤT BẠI.");
        }
    } catch (error) {
        console.error(`\n💥 ĐÃ XẢY RA LỖI NGHIÊM TRỌNG: ${error.message}`);
        console.error(error.stack);
    }
}

// Chạy hàm test
runTest();