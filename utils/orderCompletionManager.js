// utils/orderCompletionManager.js
const EventEmitter = require('events');
const settingsService = require('./settingsService');
const Order = require('../models/Order');
const Item = require('../models/Item');
const User = require('../models/User');
const { logActivity } = require('./activityLogService');

class OrderCompletionManager extends EventEmitter {
    constructor() {
        super();
        this.io = null;
        this.timer = null;
        this.isJobRunning = false;
    }

    initialize(io) {
        this.io = io;
        console.log('🔄 Initializing Order Completion Manager...');
        this.start();
    }

    start() {
        if (this.timer) clearInterval(this.timer);
        // Lấy polling interval từ settings, mặc định là 10 giây
        const intervalMs = (settingsService.get('itemProcessor')?.pollingInterval || 10) * 1000;
        console.log(`[OrderCompletionManager] Service started. Polling every ${intervalMs / 1000}s.`);
        
        this.timer = setInterval(() => this.runCheck(), intervalMs);
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        console.log('[OrderCompletionManager] Service stopped.');
    }

    async runCheck() {
        if (this.isJobRunning) {
            console.log('[OrderCompletionManager] A check is already running, skipping this interval.');
            return;
        }

        this.isJobRunning = true;
        try {
            const processingOrders = await Order.find({ status: 'processing' }).populate('user');

            if (processingOrders.length === 0) {
                return;
            }
            
            console.log(`[OrderCompletionManager] Found ${processingOrders.length} processing order(s) to check.`);

            for (const order of processingOrders) {
                await this.updateOrderProgress(order);
            }

        } catch (error) {
            console.error('[OrderCompletionManager] Critical error during order check:', error);
        } finally {
            this.isJobRunning = false;
        }
    }
    
    async updateOrderProgress(order) {
        try {
            const [completedCount, failedCount] = await Promise.all([
                Item.countDocuments({ orderId: order._id, status: 'completed' }),
                Item.countDocuments({ orderId: order._id, status: 'failed' })
            ]);

            const hasChanged = order.completedItems !== completedCount || order.failedItems !== failedCount;

            if (hasChanged) {
                order.completedItems = completedCount;
                order.failedItems = failedCount;
                await order.save();

                const orderRoom = `order_${order._id.toString()}`;
                const userRoom = `user_${order.user._id.toString()}`;
                
                this.io.to(orderRoom).to(userRoom).emit('order:item_update', {
                    id: order._id.toString(),
                    completedItems: order.completedItems,
                    failedItems: order.failedItems,
                    totalItems: order.totalItems,
                });
            }

            // Check for completion after updating counts
            if ((completedCount + failedCount) >= order.totalItems) {
                await this.finalizeOrder(order);
            }
        } catch (error) {
             console.error(`[OrderCompletionManager] Error updating progress for order ${order.shortId}:`, error);
        }
    }

    async finalizeOrder(order) {
         if (order.status !== 'processing') {
            console.log(`[OrderCompletionManager] Order #${order.shortId} is already finalized, skipping.`);
            return;
        }

        console.log(`[OrderCompletionManager] Finalizing order #${order.shortId}...`);

        const finalCompletedCount = order.completedItems;
        const initialCost = order.pricePerItem * order.totalItems;
        const finalPricePerItem = settingsService.calculatePricePerItem(finalCompletedCount);
        const finalCost = finalCompletedCount * finalPricePerItem;
        const refundAmount = initialCost - finalCost;

        order.status = 'completed';
        order.totalCost = finalCost;
        
        let user = await User.findById(order.user._id);
        const balanceBefore = user.balance;

        if (refundAmount > 0) {
            user.balance += refundAmount;
            const logDetails = `Hoàn tiền chênh lệch ${refundAmount.toLocaleString('vi-VN')}đ cho đơn hàng #${order.shortId} sau khi quyết toán.`;
            await logActivity(user._id, 'ORDER_REFUND', {
                details: logDetails,
                context: 'Admin', // System action is logged as Admin
                metadata: {
                    balanceBefore: balanceBefore,
                    balanceAfter: user.balance,
                    change: refundAmount
                }
            });
            console.log(`[OrderCompletionManager] Refunded ${refundAmount} to user ${user.username} for order #${order.shortId}`);
        }

        await Promise.all([order.save(), user.save()]);

        const orderRoom = `order_${order._id.toString()}`;
        const userRoom = `user_${order.user._id.toString()}`;
        this.io.to(orderRoom).to(userRoom).emit('order:update', { id: order._id.toString(), status: 'completed' });
        
        console.log(`[OrderCompletionManager] Order #${order.shortId} has been successfully completed.`);
    }
}

module.exports = new OrderCompletionManager();