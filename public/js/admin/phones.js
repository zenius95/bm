// public/js/admin/phones.js
document.addEventListener('DOMContentLoaded', () => {
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    const itemCheckboxes = document.querySelectorAll('.item-checkbox');
    const hardDeleteSelectedBtn = document.getElementById('hardDeleteSelectedBtn');
    const softDeleteSelectedBtn = document.getElementById('softDeleteSelectedBtn');
    const restoreSelectedBtn = document.getElementById('restoreSelectedBtn');
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
        if (hardDeleteSelectedBtn) hardDeleteSelectedBtn.disabled = !anyChecked;
        if (softDeleteSelectedBtn) softDeleteSelectedBtn.disabled = !anyChecked;
        if (restoreSelectedBtn) restoreSelectedBtn.disabled = !anyChecked;
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
            if (selectAllCheckbox) selectAllCheckbox.checked = [...itemCheckboxes].every(c => c.checked);
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

    if (clearSelectionLink) {
        clearSelectionLink.addEventListener('click', (e) => {
            e.preventDefault();
            isSelectAllAcrossPages = false;
            if (selectAllCheckbox) selectAllCheckbox.checked = false;
            itemCheckboxes.forEach(cb => cb.checked = false);
            toggleActionButtons();
            updateBanners();
        });
    }
    
    toggleActionButtons();
    
    async function handleBulkAction(url, confirmMessage, confirmType = 'warning') {
        let payload = {};
        const selectedIdsOnPage = [...itemCheckboxes].filter(cb => cb.checked).map(cb => cb.value);
        if (isSelectAllAcrossPages) {
            payload = { selectAll: true, filters: JSON.parse(document.body.dataset.currentQuery) };
        } else {
            if (selectedIdsOnPage.length === 0) {
                return showToast('Vui lòng chọn ít nhất một mục.', 'Cảnh báo!', 'warning');
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
                    showToast(result.message || 'Có lỗi xảy ra.', 'Lỗi!', 'error');
                }
            } catch (error) {
                showToast('Lỗi kết nối.', 'Lỗi mạng!', 'error');
            }
        }
    }

    if (hardDeleteSelectedBtn) {
        hardDeleteSelectedBtn.addEventListener('click', () => {
            handleBulkAction('/admin/phones/hard-delete', (count) => `Bạn có chắc muốn XÓA VĨNH VIỄN ${count} SĐT?`, 'danger');
        });
    }

    if (softDeleteSelectedBtn) {
        softDeleteSelectedBtn.addEventListener('click', () => {
            handleBulkAction('/admin/phones/soft-delete', (count) => `Bạn có chắc muốn chuyển ${count} SĐT vào thùng rác?`);
        });
    }

    if (restoreSelectedBtn) {
        restoreSelectedBtn.addEventListener('click', () => {
            handleBulkAction('/admin/phones/restore', (count) => `Bạn có chắc muốn khôi phục ${count} SĐT?`, 'info');
        });
    }
});