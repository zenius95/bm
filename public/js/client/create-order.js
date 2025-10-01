document.addEventListener('DOMContentLoaded', () => {
    // Lấy các element trên trang theo đúng file gốc của Bro
    const itemsData = document.getElementById('itemsData');
    const clearBtn = document.getElementById('clear-btn');
    const itemCountEl = document.getElementById('item-count');
    const totalCostEl = document.getElementById('total-cost');
    const createOrderBtn = document.getElementById('create-order-btn');
    const balanceWarning = document.getElementById('balance-warning');
    const pricePerItemEl = document.getElementById('price-per-item');
    const userBalanceEl = document.getElementById('user-balance');
    const pricingTiersContainer = document.getElementById('pricing-tiers-container');
    const summaryCard = document.getElementById('summary-card');
    const itemLimitWarning = document.getElementById('item-limit-warning');
    const itemFormatWarning = document.getElementById('item-format-warning');
    
    // Lấy dữ liệu từ EJS và sắp xếp
    const pricingTiersData = JSON.parse(document.body.dataset.pricingTiers || '[]').sort((a, b) => b.quantity - a.quantity);
    const userBalance = parseInt(document.body.dataset.userBalance, 10);
    const maxItems = parseInt(document.body.dataset.maxItems, 10);
    const validIdRegex = /^\d+$/;

    // Hiển thị số dư ban đầu
    userBalanceEl.textContent = userBalance.toLocaleString('vi-VN') + 'đ';

    // === 1. VẼ MỐC GIÁ - GIỮ NGUYÊN 100% LAYOUT GỐC ===
    const sortedRenderTiers = [...pricingTiersData].sort((a, b) => a.quantity - b.quantity);
    pricingTiersContainer.innerHTML = '';
    if (sortedRenderTiers.length > 0) {
        sortedRenderTiers.forEach((tier, index) => {
            const card = document.createElement('div');
            // Thêm data-quantity để highlight sau này
            card.dataset.quantity = tier.quantity; 

            let cardClasses = "tier-card bg-slate-800/50 p-5 py-6 rounded-lg text-center border border-slate-700 transition hover:border-blue-500 hover:bg-slate-800 flex flex-col justify-between";
            let quantityText = '';
            let badge = '';

            const nextTier = sortedRenderTiers[index + 1];
            if (nextTier) {
                quantityText = `Từ <strong>${tier.quantity}</strong> - <strong>${nextTier.quantity - 1}</strong>`;
            } else {
                quantityText = `Từ <strong>${tier.quantity}</strong> trở lên`;
                cardClasses += ' relative border-purple-500/50';
                badge = `<div class="absolute -top-2.5 left-0 right-0 text-xs bg-purple-600 text-white font-semibold px-2 py-0.5 rounded-full shadow-lg mx-auto w-24">Giá Tốt Nhất</div>`;
            }

            card.className = cardClasses;
            card.innerHTML = `
                ${badge}
                <div class="flex-grow flex flex-col justify-center">
                    <p class="font-bold text-white mb-4">${quantityText}</p>
                </div>
                <div>
                    <p class="text-xl font-bold text-yellow-400 font-mono">${tier.price.toLocaleString('vi-VN')}đ</p>
                    <p class="text-xs text-slate-500">/ item</p>
                </div>
            `;
            pricingTiersContainer.appendChild(card);
        });
    }

    // === 2. HÀM TÍNH GIÁ ===
    function getPriceForQuantity(count) {
        if (pricingTiersData.length === 0) return 0;
        const applicableTier = pricingTiersData.find(tier => count >= tier.quantity);
        return applicableTier ? applicableTier.price : (pricingTiersData[pricingTiersData.length - 1]?.price || 0);
    }

    // === 3. HÀM CẬP NHẬT GIAO DIỆN CHÍNH ===
    function updateCost() {
        const lines = itemsData.value.trim().split('\n').filter(line => line.trim() !== '');
        const count = lines.length;
        const currentPrice = getPriceForQuantity(count);
        const totalCost = count * currentPrice;

        // Cập nhật text
        itemCountEl.textContent = count;
        pricePerItemEl.textContent = currentPrice.toLocaleString('vi-VN') + 'đ';
        totalCostEl.textContent = totalCost.toLocaleString('vi-VN') + 'đ';

        // Highlight mốc giá đang áp dụng
        const activeTierQuantity = getPriceForQuantity(count) > 0 ? pricingTiersData.find(t => count >= t.quantity).quantity : null;
        document.querySelectorAll('.tier-card').forEach(card => {
            if (parseInt(card.dataset.quantity, 10) === activeTierQuantity) {
                 card.classList.add('active', 'border-blue-500', 'bg-slate-800', 'scale-105');
                 card.classList.remove('hover:border-blue-500', 'hover:bg-slate-800');
            } else {
                 card.classList.remove('active', 'border-blue-500', 'bg-slate-800', 'scale-105');
                 card.classList.add('hover:border-blue-500', 'hover:bg-slate-800');
            }
        });

        // Xử lý các cảnh báo và trạng thái nút
        let isOverLimit = false;
        if (maxItems > 0 && count > maxItems) {
            isOverLimit = true;
            if (itemLimitWarning) {
                itemLimitWarning.textContent = `Số lượng items vượt quá giới hạn cho phép (${maxItems}).`;
                itemLimitWarning.classList.remove('hidden');
            }
        } else {
            if (itemLimitWarning) itemLimitWarning.classList.add('hidden');
        }

        let hasInvalidFormat = false;
        if (count > 0) {
            hasInvalidFormat = lines.some(line => !validIdRegex.test(line.trim()));
        }
        if (itemFormatWarning) {
            itemFormatWarning.classList.toggle('hidden', !hasInvalidFormat);
        }
        
        const isBalanceInsufficient = totalCost > userBalance && count > 0;
        balanceWarning.classList.toggle('hidden', !isBalanceInsufficient);
        
        if (isBalanceInsufficient || isOverLimit || hasInvalidFormat) {
            summaryCard.classList.add('border-red-500/50');
            summaryCard.classList.remove('border-slate-800');
        } else {
            summaryCard.classList.remove('border-red-500/50');
            summaryCard.classList.add('border-slate-800');
        }
        
        totalCostEl.classList.toggle('text-red-400', isBalanceInsufficient);
        totalCostEl.classList.toggle('text-yellow-400', !isBalanceInsufficient);
        
        createOrderBtn.disabled = count === 0 || isOverLimit || isBalanceInsufficient || hasInvalidFormat;
    }

    // === 4. GÁN SỰ KIỆN ===
    itemsData.addEventListener('input', updateCost);
    clearBtn.addEventListener('click', () => {
        itemsData.value = '';
        itemsData.focus();
        updateCost();
    });

    // === 5. KHỞI CHẠY LẦN ĐẦU ===
    updateCost();
});