// insta/test.js
const { runAppealProcess } = require('../insta/runInsta.js');
const settingsService = require('../utils/settingsService');

// II. Chạy test
async function runTest() {
    // ---- THAY ĐỔI THÔNG TIN CỦA BRO VÀO ĐÂY ----
    const account = {
        uid: 'elliotbryant60147216',
        password: 'Ooybiqd601472',
        twofa: 'V6NHYJGWK7YOKGF6F2U37TLYI3XAXSEH',
        proxy: 'http://FBZlGu:taRIgP@171.236.164.76:32618'
    };
    const bmIdToAppeal = '3711504885822571';

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