document.addEventListener('DOMContentLoaded', () => {
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
    const pricingTiersForCalc = JSON.parse(document.body.dataset.pricingTiers || '[]').sort((a, b) => b.quantity - a.quantity);
    const userBalance = parseInt(document.body.dataset.userBalance, 10);
    const maxItems = parseInt(document.body.dataset.maxItems, 10);
    const itemLimitWarning = document.getElementById('item-limit-warning');
    // START: THÊM MỚI
    const itemFormatWarning = document.getElementById('item-format-warning');
    const validIdRegex = /^\d+$/;
    // END: THÊM MỚI


    userBalanceEl.textContent = userBalance.toLocaleString('vi-VN') + 'đ';

    const sortedRenderTiers = [...pricingTiersForCalc].sort((a, b) => a.quantity - b.quantity);
    pricingTiersContainer.innerHTML = '';
    if (sortedRenderTiers.length > 0) {
        sortedRenderTiers.forEach((tier, index) => {
            const card = document.createElement('div');
            let cardClasses = "bg-slate-800/50 p-5 py-6 rounded-lg text-center border border-slate-700 transition hover:border-blue-500 hover:bg-slate-800 flex flex-col justify-between";
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
                    <p class=" font-bold text-white mb-4">${quantityText}</p>
                </div>
                <div>
                    <p class="text-xl font-bold text-yellow-400 font-mono">${tier.price.toLocaleString('vi-VN')}đ</p>
                    <p class="text-xs text-slate-500">/ item</p>
                </div>
            `;
            pricingTiersContainer.appendChild(card);
        });
    }


    function getPriceForQuantity(count) {
        if (pricingTiersForCalc.length === 0) return 0;
        const applicableTier = pricingTiersForCalc.find(tier => count >= tier.quantity);
        return applicableTier ? applicableTier.price : (pricingTiersForCalc[pricingTiersForCalc.length - 1]?.price || 0);
    }

    function updateCost() {
        const lines = itemsData.value.trim().split('\n').filter(line => line.trim() !== '');
        const count = lines.length;
        const currentPrice = getPriceForQuantity(count);
        const totalCost = count * currentPrice;

        // START: CẬP NHẬT LOGIC KIỂM TRA
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
        // END: CẬP NHẬT LOGIC KIỂM TRA

        itemCountEl.textContent = count;
        pricePerItemEl.textContent = currentPrice.toLocaleString('vi-VN') + 'đ';
        totalCostEl.textContent = totalCost.toLocaleString('vi-VN') + 'đ';

        // START: CẬP NHẬT ĐIỀU KIỆN VÔ HIỆU HÓA NÚT BẤM
        const isBalanceInsufficient = totalCost > userBalance;
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
        // END: CẬP NHẬT ĐIỀU KIỆN VÔ HIỆU HÓA NÚT BẤM
    }

    itemsData.addEventListener('input', updateCost);
    clearBtn.addEventListener('click', () => {
        itemsData.value = '';
        itemsData.focus();
        updateCost();
    });
    updateCost();
});