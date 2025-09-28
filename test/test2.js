// test/apiLoadTest.js
const fetch = require('node-fetch');

// --- CẤU HÌNH TEST ---
const API_BASE_URL = 'http://localhost:3000/api/phone'; // Sửa lại port nếu cần
const MASTER_API_KEY = '2b26be39141b87dceccb22b003db6a177e260d353dcddf1e4d9b916b35eee130'; // API Key của Bro
const SIMULATED_REQUESTS = 20; // Giả lập 20 yêu cầu đồng thời
const SERVICE_TO_GET_CODE = 'instagram'; // Dịch vụ cần lấy code
const GET_CODE_TIMEOUT_MS = 45000; // Chờ tối đa 45 giây cho mỗi yêu cầu get-code

/**
 * Hàm thực hiện một quy trình hoàn chỉnh: lấy số -> lấy code -> hủy số.
 * @param {number} requestIndex - Số thứ tự của yêu cầu để tiện theo dõi
 */
async function runFullProcess(requestIndex) {
    console.log(`[Quy trình #${requestIndex}] 🟡 Bắt đầu...`);
    const startTime = Date.now();
    let phoneNumberId = null;

    try {
        // --- BƯỚC 1: LẤY SỐ ĐIỆN THOẠI ---
        const getNumberUrl = `${API_BASE_URL}/get-number?apiKey=${MASTER_API_KEY}&country=USA`;
        console.log(`[Quy trình #${requestIndex}] 📲 Đang gọi API lấy số...`);
        const numberRes = await fetch(getNumberUrl);
        const numberData = await numberRes.json();

        if (!numberRes.ok || !numberData.success) {
            throw new Error(`Lấy số thất bại: ${numberData.message || 'Không rõ lỗi'}`);
        }
        phoneNumberId = numberData.phone._id;
        console.log(`[Quy trình #${requestIndex}] 📞 Lấy được SĐT ID: ${phoneNumberId}`);

        // --- BƯỚC 2: LẤY CODE ---
        const getCodeUrl = `${API_BASE_URL}/get-code?apiKey=${MASTER_API_KEY}&phoneNumberId=${phoneNumberId}&service=${SERVICE_TO_GET_CODE}`;
        console.log(`[Quy trình #${requestIndex}] 💬 Đang gọi API lấy code cho SĐT ID: ${phoneNumberId}...`);
        
        const controller = new AbortController();
        const timeout = setTimeout(() => {
            controller.abort();
        }, GET_CODE_TIMEOUT_MS);

        const codeRes = await fetch(getCodeUrl, { signal: controller.signal });
        clearTimeout(timeout);
        
        const codeData = await codeRes.json();

        if (!codeRes.ok || !codeData.success) {
            // Đây không hẳn là lỗi, có thể do SĐT chưa nhận được tin nhắn
            console.log(`[Quy trình #${requestIndex}] ⚠️ Không tìm thấy code cho SĐT ID: ${phoneNumberId} (Lý do: ${codeData.message})`);
            return { success: false, reason: 'No code found' };
        }

        const duration = (Date.now() - startTime) / 1000;
        console.log(`[Quy trình #${requestIndex}] ✅ THÀNH CÔNG sau ${duration.toFixed(2)}s. Code: ${codeData.code}`);
        return { success: true, duration };

    } catch (error) {
        if (error.name === 'AbortError') {
            console.error(`[Quy trình #${requestIndex}] ❌ Thất bại do timeout sau ${GET_CODE_TIMEOUT_MS / 1000}s.`);
            return { success: false, reason: 'Timeout' };
        }
        const duration = (Date.now() - startTime) / 1000;
        console.error(`[Quy trình #${requestIndex}] ❌ Thất bại sau ${duration.toFixed(2)}s. Lỗi: ${error.message}`);
        return { success: false, reason: error.message };
    } finally {
        // --- BƯỚC 3: HỦY SỐ (QUAN TRỌNG) ---
        if (phoneNumberId) {
            console.log(`[Quy trình #${requestIndex}] ↩️  Đang hủy SĐT ID: ${phoneNumberId}...`);
            const cancelUrl = `${API_BASE_URL}/cancel-number?apiKey=${MASTER_API_KEY}&phoneNumberId=${phoneNumberId}`;
            await fetch(cancelUrl).catch(err => console.error(`Lỗi khi hủy số: ${err.message}`));
        }
    }
}

/**
 * Chạy bài test chính
 */
async function runApiLoadTest() {
    console.log('--- BẮT ĐẦU TEST TẢI CAO API THỰC TẾ ---');
    console.log(`Chuẩn bị bắn ${SIMULATED_REQUESTS} quy trình (lấy số -> lấy code) đồng thời...\n`);
    
    // Đảm bảo server có thời gian khởi động trình duyệt
    console.log("Đang chờ 5 giây để server khởi động trình duyệt...");
    await new Promise(resolve => setTimeout(resolve, 5000));

    const requestPromises = [];
    for (let i = 1; i <= SIMULATED_REQUESTS; i++) {
        requestPromises.push(runFullProcess(i));
    }

    // Chờ tất cả các quy trình hoàn thành
    const results = await Promise.all(requestPromises);

    console.log('\n--- TEST HOÀN TẤT ---');
    const successCount = results.filter(r => r.success).length;
    const failedCount = results.length - successCount;
    const successfulDurations = results.filter(r => r.success).map(r => r.duration);
    const avgDuration = successfulDurations.length > 0 
        ? successfulDurations.reduce((sum, d) => sum + d, 0) / successfulDurations.length
        : 0;

    console.log(`Tổng kết:`);
    console.log(`  - ✅ Thành công: ${successCount}/${SIMULATED_REQUESTS}`);
    console.log(`  - ❌ Thất bại/Không có code: ${failedCount}/${SIMULATED_REQUESTS}`);
    if (avgDuration > 0) {
        console.log(`  - ⏱️  Thời gian xử lý trung bình (cho các lần thành công): ${avgDuration.toFixed(2)} giây/yêu cầu.`);
    }
    
    process.exit(0);
}

runApiLoadTest();