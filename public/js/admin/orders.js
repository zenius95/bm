document.addEventListener('DOMContentLoaded', () => {
    const createOrderForm = document.getElementById('create-order-form');
    if (createOrderForm) {
        const createOrderBtn = document.getElementById('create-order-btn');
        const itemsData = document.getElementById('itemsData');
        const userSelect = document.getElementById('userSelect');
        const userBalanceEl = document.getElementById('user-balance');
        const itemCountEl = document.getElementById('item-count');
        const totalCostEl = document.getElementById('total-cost');
        const pricePerItemEl = document.getElementById('price-per-item');
        const pricingTiers = JSON.parse(document.body.dataset.pricingTiers || '[]').sort((a, b) => b.quantity - a.quantity);
        const adminBalance = parseInt(document.body.dataset.adminBalance, 10);
        
        const getPriceForQuantity = (count) => {
            if (pricingTiers.length === 0) return 0;
            const applicableTier = pricingTiers.find(tier => count >= tier.quantity);
            return applicableTier ? applicableTier.price : (pricingTiers[pricingTiers.length - 1]?.price || 0);
        };
        
        const updateCost = () => {
            const lines = itemsData.value.trim().split('\n').filter(line => line.trim() !== '');
            const count = lines.length;
            const currentPrice = getPriceForQuantity(count);
            const total = count * currentPrice;
            
            itemCountEl.textContent = count;
            pricePerItemEl.textContent = currentPrice.toLocaleString('vi-VN') + 'đ';
            totalCostEl.textContent = total.toLocaleString('vi-VN') + 'đ';

            const selectedOption = userSelect.options[userSelect.selectedIndex];
            const userBalance = selectedOption.value ? parseInt(selectedOption.dataset.balance, 10) : adminBalance;
            userBalanceEl.textContent = userBalance.toLocaleString('vi-VN') + 'đ';

            if (total > userBalance) {
                totalCostEl.classList.remove('text-yellow-400');
                totalCostEl.classList.add('text-red-400');
                userBalanceEl.classList.remove('text-white');
                userBalanceEl.classList.add('text-red-400');
            } else {
                totalCostEl.classList.add('text-yellow-400');
                totalCostEl.classList.remove('text-red-400');
                userBalanceEl.classList.add('text-white');
                userBalanceEl.classList.remove('text-red-400');
            }
        };

        itemsData.addEventListener('input', updateCost);
        userSelect.addEventListener('change', updateCost);
        updateCost();
        
        createOrderForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            createOrderBtn.disabled = true;
            createOrderBtn.innerHTML = `<i class="ri-loader-4-line animate-spin -ml-1 mr-2"></i> Đang tạo...`;
            try {
                const response = await fetch('/admin/orders/create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        itemsData: itemsData.value,
                        userId: userSelect.value 
                    })
                });
                const result = await response.json();
                if (response.ok) {
                    showToast(result.message, 'Thành công!', 'success');
                    setTimeout(() => {
                        window.location.reload();
                    }, 1500);
                } else {
                    showToast(result.message, 'Có lỗi xảy ra!', 'error');
                }
            } catch (error) {
                showToast('Không thể kết nối đến server.', 'Lỗi mạng!', 'error');
            } finally {
                createOrderBtn.disabled = false;
                createOrderBtn.innerHTML = `<i class="ri-add-line -ml-1 mr-2"></i> <span>Tạo Đơn Hàng</span>`;
            }
        });
    }

    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    const itemCheckboxes = document.querySelectorAll('.item-checkbox');
    const softDeleteSelectedBtn = document.getElementById('softDeleteSelectedBtn');
    const restoreSelectedBtn = document.getElementById('restoreSelectedBtn');
    const hardDeleteSelectedBtn = document.getElementById('hardDeleteSelectedBtn');
    const selectAllBanner = document.getElementById('select-all-banner');
    const clearSelectionBanner = document.getElementById('clear-selection-banner');
    const selectAllMatchingItemsLink = document.getElementById('select-all-matching-items');
    const clearSelectionLink = document.getElementById('clear-selection');
    const itemsOnPageCountSpan = document.getElementById('items-on-page-count');
    let isSelectAllAcrossPages = false;

    function updateBanners() {
        if (!selectAllBanner) return;
        const allCheckedOnPage = itemCheckboxes.length > 0 && [...itemCheckboxes].every(cb => cb.checked);
        if (isSelectAllAcrossPages) {
            selectAllBanner.classList.add('hidden');
            clearSelectionBanner.classList.remove('hidden');
        } else if (allCheckedOnPage) {
            itemsOnPageCountSpan.textContent = itemCheckboxes.length;
            selectAllBanner.classList.remove('hidden');
            clearSelectionBanner.classList.add('hidden');
        } else {
            selectAllBanner.classList.add('hidden');
            clearSelectionBanner.classList.add('hidden');
        }
    }
    
    function toggleActionButtons() {
        const anyChecked = [...itemCheckboxes].some(cb => cb.checked) || isSelectAllAcrossPages;
        if (softDeleteSelectedBtn) softDeleteSelectedBtn.disabled = !anyChecked;
        if (restoreSelectedBtn) restoreSelectedBtn.disabled = !anyChecked;
        if (hardDeleteSelectedBtn) hardDeleteSelectedBtn.disabled = !anyChecked;
    }

    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (e) => {
            isSelectAllAcrossPages = false;
            itemCheckboxes.forEach(cb => cb.checked = e.target.checked);
            toggleActionButtons();
            updateBanners();
        });
    }

    itemCheckboxes.forEach(cb => {
        cb.addEventListener('change', () => {
            isSelectAllAcrossPages = false;
            if(selectAllCheckbox) selectAllCheckbox.checked = [...itemCheckboxes].every(c => c.checked);
            toggleActionButtons();
            updateBanners();
        });
    });

    if (selectAllMatchingItemsLink) {
        selectAllMatchingItemsLink.addEventListener('click', (e) => {
            e.preventDefault();
            isSelectAllAcrossPages = true;
            toggleActionButtons();
            updateBanners();
        });
    }

    if(clearSelectionLink) {
        clearSelectionLink.addEventListener('click', (e) => {
            e.preventDefault();
            isSelectAllAcrossPages = false;
            if (selectAllCheckbox) selectAllCheckbox.checked = false;
            itemCheckboxes.forEach(cb => cb.checked = false);
            toggleActionButtons();
            updateBanners();
        });
    }

    async function handleAction(url, confirmMessage, confirmType = 'warning') {
        let payload = {};
        const selectedIdsOnPage = [...itemCheckboxes].filter(cb => cb.checked).map(cb => cb.value);

        if (isSelectAllAcrossPages) {
            payload = { selectAll: true, filters: JSON.parse(document.body.dataset.currentQuery) };
        } else {
            if (selectedIdsOnPage.length === 0) {
                showToast('Vui lòng chọn ít nhất một mục.', 'Cảnh báo!', 'warning');
                return;
            };
            payload = { ids: selectedIdsOnPage };
        }
        const totalCount = isSelectAllAcrossPages ? parseInt(document.body.dataset.totalItems, 10) : selectedIdsOnPage.length;

        const confirmed = await showConfirm(confirmMessage(totalCount), confirmType);
        if (confirmed) {
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const result = await response.json();
                if (result.success) {
                    showToast(result.message, 'Thành công!', 'success');
                    setTimeout(() => window.location.reload(), 1000);
                } else {
                    showToast(result.message, 'Lỗi!', 'error');
                }
            } catch (error) {
                showToast('Lỗi kết nối server.', 'Lỗi!', 'error');
            }
        }
    }
    
    if (softDeleteSelectedBtn) {
        softDeleteSelectedBtn.addEventListener('click', () => {
            handleAction('/admin/orders/soft-delete', (count) => `Bạn có chắc muốn chuyển ${count} đơn hàng vào thùng rác?`);
        });
    }

    if (restoreSelectedBtn) {
        restoreSelectedBtn.addEventListener('click', () => {
            handleAction('/admin/orders/restore', (count) => `Bạn có chắc muốn khôi phục ${count} đơn hàng?`, 'info');
        });
    }

    if (hardDeleteSelectedBtn) {
        hardDeleteSelectedBtn.addEventListener('click', () => {
            handleAction('/admin/orders/hard-delete', (count) => `HÀNH ĐỘNG NGUY HIỂM!\nBạn có chắc muốn XÓA VĨNH VIỄN ${count} đơn hàng? Dữ liệu sẽ không thể phục hồi.`, 'danger');
        });
    }
    
    toggleActionButtons();

    const socket = io();
    socket.on('connect', () => console.log('Connected to server for real-time order updates.'));
    socket.on('order:update', (data) => {
        const { id, status } = data;
        const statusBadge = document.getElementById(`status-${id}`);
        if (!statusBadge) return;

        let statusClass = 'bg-gray-700 text-gray-300';
        if (status === 'processing') statusClass = 'bg-yellow-500/20 text-yellow-400';
        if (status === 'completed') statusClass = 'bg-green-500/20 text-green-400';
        if (status === 'failed') statusClass = 'bg-red-500/20 text-red-400';
        
        statusBadge.textContent = status;
        statusBadge.className = `px-2.5 py-1 text-xs font-semibold rounded-full ${statusClass}`;
    });
    socket.on('order:item_update', (data) => {
        const { id, completedItems, failedItems } = data;
        const row = document.getElementById(`order-row-${id}`);
        if (!row) return;

        const completedEl = row.querySelector('.item-completed-count');
        const failedEl = row.querySelector('.item-failed-count');

        if (completedEl) completedEl.textContent = completedItems;
        if (failedEl) failedEl.textContent = failedItems;
    });
    socket.on('orders:trash:update', (data) => {
        const trashCountSpan = document.getElementById('trash-count');
        if (trashCountSpan) {
            trashCountSpan.textContent = data.newTrashCount;
        }
    });
});