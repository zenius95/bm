// fix_order_counts.js
const mongoose = require('mongoose');
const config = require('../config');
const Order = require('../models/Order');
const Item = require('../models/Item');
const User = require('../models/User');
const settingsService = require('../utils/settingsService');
const { logActivity } = require('../utils/activityLogService');

/**
 * Script để xác minh, sửa lỗi sai lệch bộ đếm và tính toán chênh lệch chi phí trong các đơn hàng.
 *
 * Cách chạy:
 * 1. Chỉ kiểm tra và báo cáo: node fix_order_counts.js
 * 2. Kiểm tra và tự động sửa lỗi: node fix_order_counts.js --fix
 */

async function verifyAndFixOrderCounts() {
    console.log('🚀 Bắt đầu quá trình kiểm tra, sửa lỗi bộ đếm và phân tích chi phí đơn hàng...');
    
    const shouldFix = process.argv.includes('--fix');
    if (shouldFix) {
        console.warn('⚠️  CHẾ ĐỘ TỰ ĐỘNG SỬA ĐANG BẬT. Các đơn hàng có bộ đếm và chi phí sai sẽ được cập nhật.');
    } else {
        console.info('ℹ️  Chạy ở chế độ chỉ kiểm tra. Để tự động sửa, hãy chạy lại với cờ --fix.');
    }

    try {
        // Khởi tạo settings và kết nối DB
        await settingsService.initialize();
        await mongoose.connect(config.mongodb.uri);
        console.log('✅  Kết nối MongoDB và khởi tạo Settings thành công.');

        // Chỉ quét các đơn hàng đã hoàn tất (completed)
        const completedOrders = await Order.find({ status: 'completed' }).populate('user', 'username balance').lean();
        console.log(`🔎  Tìm thấy tổng cộng ${completedOrders.length} đơn hàng đã hoàn thành để quét.`);

        let inconsistentCount = 0;
        let fixedCount = 0;
        // *** BẮT ĐẦU THAY ĐỔI: Thêm biến chi tiết ***
        let totalRefunded = 0; // Tổng tiền hoàn lại cho user
        let totalClawedBack = 0; // Tổng tiền thu lại từ user
        // *** KẾT THÚC THAY ĐỔI ***

        for (const order of completedOrders) {
            if (!order.user) {
                console.warn(`- Bỏ qua đơn hàng #${order.shortId} vì không có thông tin user.`);
                continue;
            }
            const actualCompleted = await Item.countDocuments({ orderId: order._id, status: 'completed' });
            const correctPricePerItem = settingsService.calculatePricePerItem(actualCompleted);
            const correctTotalCost = actualCompleted * correctPricePerItem;
            const isCountInconsistent = order.completedItems !== actualCompleted;
            const isCostInconsistent = order.totalCost !== correctTotalCost;

            if (isCountInconsistent || isCostInconsistent) {
                inconsistentCount++;
                const discrepancyAmount = order.totalCost - correctTotalCost;
                
                // *** BẮT ĐẦU THAY ĐỔI: Phân loại tiền chênh lệch ***
                if (discrepancyAmount > 0) {
                    totalRefunded += discrepancyAmount;
                } else if (discrepancyAmount < 0) {
                    totalClawedBack += Math.abs(discrepancyAmount);
                }
                // *** KẾT THÚC THAY ĐỔI ***

                console.log('\n--------------------------------------------------');
                console.error(`❌ PHÁT HIỆN LỖI: Đơn hàng #${order.shortId} (User: ${order.user.username})`);
                
                if (isCountInconsistent) {
                    console.log(`   - BỘ ĐẾM SAI: Lưu trữ ${order.completedItems} completed, Thực tế là ${actualCompleted}`);
                }
                if (isCostInconsistent) {
                     console.log(`   - CHI PHÍ SAI: Đã trừ ${order.totalCost.toLocaleString('vi-VN')}đ, Lẽ ra phải trừ ${correctTotalCost.toLocaleString('vi-VN')}đ`);
                }
                
                if (discrepancyAmount > 0) {
                    console.warn(`   -> 💰 CẦN HOÀN LẠI CHO USER: ${discrepancyAmount.toLocaleString('vi-VN')}đ`);
                } else if (discrepancyAmount < 0) {
                    console.error(`   -> 🔥 HỆ THỐNG BỊ LỖ: ${Math.abs(discrepancyAmount).toLocaleString('vi-VN')}đ`);
                }

                if (shouldFix) {
                    try {
                        const userToUpdate = await User.findById(order.user._id);
                        if (!userToUpdate) throw new Error(`Không tìm thấy user với ID ${order.user._id}`);
                        
                        const balanceBefore = userToUpdate.balance;
                        userToUpdate.balance += discrepancyAmount; // Cộng lại số tiền đã trừ thừa
                        
                        await userToUpdate.save();
                        
                        await Order.updateOne(
                            { _id: order._id },
                            { 
                                $set: { 
                                    completedItems: actualCompleted,
                                    failedItems: order.totalItems - actualCompleted,
                                    totalCost: correctTotalCost 
                                } 
                            }
                        );

                        if (discrepancyAmount !== 0) {
                            let details;
                            if (discrepancyAmount > 0) {
                                details = `Hệ thống tự động hoàn lại ${discrepancyAmount.toLocaleString('vi-VN')}đ cho đơn hàng #${order.shortId} do tính toán lại.`;
                            } else {
                                details = `Hệ thống tự động trừ ${Math.abs(discrepancyAmount).toLocaleString('vi-VN')}đ từ đơn hàng #${order.shortId} do tính toán lại.`;
                            }

                            await logActivity(order.user._id, 'ADMIN_RECALCULATE_ORDER', {
                                details,
                                ipAddress: 'SYSTEM',
                                context: 'Admin',
                                metadata: {
                                    balanceBefore: balanceBefore,
                                    balanceAfter: userToUpdate.balance,
                                    change: discrepancyAmount,
                                    orderId: order._id
                                }
                            });
                        }

                        console.log(`   -> ✅ Đã cập nhật lại bộ đếm, chi phí và số dư user cho đơn hàng này.`);
                        fixedCount++;
                    } catch (updateError) {
                        console.error(`   -> ❌ Lỗi khi cập nhật đơn hàng ${order._id}:`, updateError);
                    }
                }
            }
        }

        // *** BẮT ĐẦU THAY ĐỔI: Cập nhật báo cáo tổng kết ***
        console.log('\n================ TỔNG KẾT ================');
        console.log(`- Đã quét xong ${completedOrders.length} đơn hàng đã hoàn thành.`);
        if (inconsistentCount > 0) {
            console.error(`- Tìm thấy ${inconsistentCount} đơn hàng có dữ liệu không nhất quán.`);
            if (shouldFix) {
                console.log(`- Đã sửa thành công ${fixedCount} đơn hàng (bao gồm cả số dư user).`);
            }
            console.log('--- PHÂN TÍCH TÀI CHÍNH ---');
            console.warn(`- 💰 Tổng số tiền đã hoàn lại cho user: ${totalRefunded.toLocaleString('vi-VN')}đ`);
            console.error(`- 🔥 Tổng số tiền hệ thống bị lỗ (đã thu lại từ user): ${totalClawedBack.toLocaleString('vi-VN')}đ`);
        } else {
            console.log('✅  Tuyệt vời! Không tìm thấy đơn hàng nào bị lỗi bộ đếm hoặc chi phí.');
        }
        console.log('=============================================');
        // *** KẾT THÚC THAY ĐỔI ***

    } catch (error) {
        console.error('❌ Đã xảy ra lỗi nghiêm trọng trong quá trình xử lý:', error);
    } finally {
        await mongoose.disconnect();
        console.log('🔚  Đã ngắt kết nối MongoDB. Quá trình hoàn tất.');
    }
}

verifyAndFixOrderCounts();