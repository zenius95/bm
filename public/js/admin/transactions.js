document.addEventListener('DOMContentLoaded', () => {
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    const itemCheckboxes = document.querySelectorAll('.item-checkbox');
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

    async function handleBulkDelete() {
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

        const confirmed = await showConfirm(`Bạn có chắc muốn XÓA VĨNH VIỄN ${totalCount} mục giao dịch? Hành động này không thể hoàn tác.`, 'danger');
        if (confirmed) {
            try {
                const response = await fetch('/admin/transactions/hard-delete', {
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
                showToast('Lỗi kết nối server.', 'Lỗi mạng!', 'error');
            }
        }
    }
    
    if (hardDeleteSelectedBtn) {
        hardDeleteSelectedBtn.addEventListener('click', handleBulkDelete);
    }
    toggleActionButtons();
});