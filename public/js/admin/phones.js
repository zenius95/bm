// public/js/admin/phones.js
document.addEventListener('DOMContentLoaded', () => {
    // --- START: LOGIC CHO MODAL XEM TIN NHẮN ---
    const messageModal = document.getElementById('message-modal');
    const messageFetchForm = document.getElementById('message-fetch-form');
    const messageResultEl = document.getElementById('message-result');

    document.querySelectorAll('.btn-view-messages').forEach(btn => {
        btn.addEventListener('click', () => {
            const phoneId = btn.dataset.id;
            const phoneNumber = btn.dataset.phoneNumber;
            
            if (messageFetchForm) {
                messageFetchForm.querySelector('#modal-phone-id').value = phoneId;
            }
            if (document.getElementById('modal-phone-number')) {
                document.getElementById('modal-phone-number').textContent = phoneNumber;
            }
            if (messageResultEl) {
                messageResultEl.textContent = 'Nhập thông tin và nhấn "Lấy tin nhắn" để bắt đầu.';
            }
            
            showModal(messageModal);
        });
    });

    if (messageFetchForm) {
        messageFetchForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const phoneId = messageFetchForm.querySelector('#modal-phone-id').value;
            const service = messageFetchForm.querySelector('#modal-service').value;
            const maxAge = messageFetchForm.querySelector('#modal-maxage').value;
            const fetchBtnText = document.getElementById('fetch-msg-text');
            const fetchBtnIcon = document.getElementById('fetch-msg-icon');

            if(fetchBtnText) fetchBtnText.textContent = 'Đang lấy...';
            if(fetchBtnIcon) fetchBtnIcon.className = 'ri-loader-4-line animate-spin mr-2';
            if(messageResultEl) messageResultEl.textContent = 'Đang tải...';

            try {
                const response = await fetch(`/admin/phones/${phoneId}/get-messages`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ service, maxAge })
                });
                const result = await response.json();
                if (result.success) {
                    if(messageResultEl) messageResultEl.textContent = JSON.stringify(result.data, null, 2);
                } else {
                    if(messageResultEl) messageResultEl.textContent = `Lỗi: ${result.message}`;
                }
            } catch (error) {
                if(messageResultEl) messageResultEl.textContent = `Lỗi kết nối: ${error.message}`;
            } finally {
                if(fetchBtnText) fetchBtnText.textContent = 'Lấy tin nhắn';
                if(fetchBtnIcon) fetchBtnIcon.className = 'ri-search-eye-line mr-2';
            }
        });
    }
    // --- END: LOGIC CHO MODAL XEM TIN NHẮN ---


    // Modal handling chung
    const backdrop = document.getElementById('modal-backdrop');
    const showModal = (modalEl) => {
        if (!modalEl || !backdrop) return; // Thêm kiểm tra
        backdrop.classList.remove('hidden');
        modalEl.classList.remove('hidden');
        setTimeout(() => {
            backdrop.classList.remove('opacity-0');
            modalEl.classList.remove('opacity-0', 'scale-95');
        }, 10);
    };
    const hideModal = (modalEl) => {
        if (!modalEl || !backdrop) return; // Thêm kiểm tra
        backdrop.classList.add('opacity-0');
        modalEl.classList.add('opacity-0', 'scale-95');
        setTimeout(() => {
            backdrop.classList.add('hidden');
            modalEl.classList.add('hidden');
        }, 300);
    };
    if (backdrop) {
        backdrop.addEventListener('click', () => document.querySelectorAll('.modal-container').forEach(hideModal));
    }
    document.querySelectorAll('.btn-cancel').forEach(btn => btn.addEventListener('click', () => hideModal(btn.closest('.modal-container'))));

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
            if(itemsOnPageCountSpan) itemsOnPageCountSpan.textContent = itemCheckboxes.length;
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