// migrateTypes.js
const mongoose = require('mongoose');
const config = require('../config'); // Script này dùng file config.js của Bro
const Order = require('../models/Order'); // Dùng model Order của Bro
const Account = require('../models/Account'); // Dùng model Account của Bro

async function runMigration() {
    console.log('🚀 Bắt đầu script chuyển đổi phân loại...');

    try {
        // 1. Kết nối tới Database
        console.log('Đang kết nối tới MongoDB...');
        await mongoose.connect(config.mongodb.uri);
        console.log('✅ Kết nối MongoDB thành công!');

        // 2. Định nghĩa điều kiện lọc: tìm các document chưa có phân loại
        // '$or' sẽ tìm các trường hợp: trường đó không tồn tại, là null, hoặc là chuỗi rỗng
        const filter = {
            $or: [
                { accountType: { $exists: false } },
                { accountType: null },
                { accountType: '' }
            ]
        };
        const orderFilter = {
            $or: [
                { orderType: { $exists: false } },
                { orderType: null },
                { orderType: '' }
            ]
        };


        // 3. Cập nhật cho collection 'accounts'
        console.log("\n▶️  Đang xử lý collection 'Accounts'...");
        const accountUpdateResult = await Account.updateMany(
            filter,
            { $set: { accountType: 'BM' } }
        );

        if (accountUpdateResult.matchedCount > 0) {
            console.log(`   - Tìm thấy ${accountUpdateResult.matchedCount} accounts chưa có phân loại.`);
            console.log(`   - ✅ Đã cập nhật thành công ${accountUpdateResult.modifiedCount} accounts thành loại 'BM'.`);
        } else {
            console.log('   - 👍 Không tìm thấy account nào cần cập nhật.');
        }


        // 4. Cập nhật cho collection 'orders'
        console.log("\n▶️  Đang xử lý collection 'Orders'...");
        const orderUpdateResult = await Order.updateMany(
            orderFilter,
            { $set: { orderType: 'BM' } }
        );

        if (orderUpdateResult.matchedCount > 0) {
            console.log(`   - Tìm thấy ${orderUpdateResult.matchedCount} đơn hàng chưa có phân loại.`);
            console.log(`   - ✅ Đã cập nhật thành công ${orderUpdateResult.modifiedCount} đơn hàng thành loại 'BM'.`);
        } else {
            console.log('   - 👍 Không tìm thấy đơn hàng nào cần cập nhật.');
        }

    } catch (error) {
        console.error('\n❌ Đã xảy ra lỗi nghiêm trọng:', error);
    } finally {
        // 5. Ngắt kết nối database
        await mongoose.disconnect();
        console.log('\n🔚 Đã ngắt kết nối MongoDB. Script hoàn tất.');
    }
}

// Chạy script
runMigration();