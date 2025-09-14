// test.js
const fetch = require('node-fetch'); // Thay axios bằng node-fetch

const API_BASE_URL = 'http://localhost:3000/api';
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runTest() {
    console.log('🚀 Bắt đầu kịch bản test API với node-fetch...');

    try {
        // --- Bước 1: Tạo một đơn hàng mới ---
        console.log('\n--- [TEST 1] Gửi yêu cầu POST /orders để tạo đơn hàng ---');
        const itemsToCreate = {
            itemsData: ["Phân tích dữ liệu A", "Gửi email cho B", "Tạo báo cáo C"]
        };

        const createResponse = await fetch(`${API_BASE_URL}/orders`, {
            method: 'POST',
            body: JSON.stringify(itemsToCreate),
            headers: { 'Content-Type': 'application/json' }
        });

        // node-fetch không throw error, ta phải tự kiểm tra status
        if (!createResponse.ok) { 
            const errorData = await createResponse.json();
            throw new Error(`Tạo đơn hàng thất bại! Status: ${createResponse.status}, Message: ${errorData.message}`);
        }

        const createResult = await createResponse.json();
        const newOrder = createResult.order;
        const orderId = newOrder._id;

        console.log(`✅ Tạo đơn hàng thành công! Order ID: ${orderId}`);
        console.log('Trạng thái ban đầu:', newOrder.status);


        // --- Bước 2: Kiểm tra trạng thái đơn hàng liên tục ---
        console.log(`\n--- [TEST 2] Bắt đầu kiểm tra trạng thái của Order ID: ${orderId} ---`);
        let currentOrder;
        let attempts = 0;
        const maxAttempts = 10;

        while (attempts < maxAttempts) {
            attempts++;
            console.log(`\nLần kiểm tra thứ ${attempts}...`);

            const getResponse = await fetch(`${API_BASE_URL}/orders/${orderId}`);
            if (!getResponse.ok) {
                 throw new Error(`Lấy thông tin đơn hàng thất bại! Status: ${getResponse.status}`);
            }

            currentOrder = await getResponse.json();

            console.log(`   - Trạng thái Order: ${currentOrder.status}`);
            currentOrder.items.forEach(item => {
                console.log(`     - Item "${item.data}": ${item.status}`);
            });

            if (currentOrder.status === 'completed') {
                console.log('\n✅ Đơn hàng đã được xử lý thành công!');
                break;
            }

            if (attempts >= maxAttempts) {
                console.log('\n❌ Test thất bại: Đơn hàng không hoàn thành sau 10 lần kiểm tra.');
                break;
            }
            
            await delay(2000);
        }

        // --- Bước 3: Test các trường hợp lỗi (Bonus) ---
        console.log('\n--- [TEST 3] Kiểm tra các trường hợp lỗi ---');

        // Lỗi: ID không hợp lệ
        const invalidIdResponse = await fetch(`${API_BASE_URL}/orders/invalid-id`);
        if (invalidIdResponse.status === 400) {
            const errorData = await invalidIdResponse.json();
            console.log(`✅ Test ID không hợp lệ thành công! Status: 400, Message: "${errorData.message}"`);
        }

        // Lỗi: ID không tồn tại
        const nonExistentId = '605a9b2b5f7e6a1b2c3d4e5f';
        const notFoundResponse = await fetch(`${API_BASE_URL}/orders/${nonExistentId}`);
        if (notFoundResponse.status === 404) {
             const errorData = await notFoundResponse.json();
            console.log(`✅ Test ID không tồn tại thành công! Status: 404, Message: "${errorData.message}"`);
        }

    } catch (error) {
        console.error('\n❌ Đã có lỗi nghiêm trọng xảy ra trong quá trình test!');
        console.error('   - Lỗi:', error.message);
    }

    console.log('\n🏁 Kịch bản test đã kết thúc.');
}

runTest();