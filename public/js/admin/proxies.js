document.addEventListener('DOMContentLoaded', () => {
    // Modal handling
    const backdrop = document.getElementById('modal-backdrop');
    const showModal = (modalEl) => {
        backdrop.classList.remove('hidden');
        modalEl.classList.remove('hidden');
        setTimeout(() => {
            backdrop.classList.remove('opacity-0');
            modalEl.classList.remove('opacity-0', 'scale-95');
        }, 10);
    };
    const hideModal = (modalEl) => {
        if (!modalEl) return;
        backdrop.classList.add('opacity-0');
        modalEl.classList.add('opacity-0', 'scale-95');
        setTimeout(() => {
            backdrop.classList.add('hidden');
            modalEl.classList.add('hidden');
        }, 300);
    };
    backdrop.addEventListener('click', () => document.querySelectorAll('.modal-container').forEach(hideModal));
    document.querySelectorAll('.btn-cancel').forEach(btn => btn.addEventListener('click', () => hideModal(btn.closest('.modal-container'))));

    // Add Proxy Form
    const addProxyForm = document.getElementById('add-proxy-form');
    if (addProxyForm) {
        const addProxyBtn = document.getElementById('add-proxy-btn');
        addProxyForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            addProxyBtn.disabled = true;
            addProxyBtn.querySelector('.btn-text').classList.add('hidden');
            addProxyBtn.querySelector('.spinner').classList.remove('hidden');
            const data = { proxyData: document.getElementById('proxyData').value };
            try {
                const response = await fetch('/admin/proxies/create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                const result = await response.json();
                if (result.success) {
                    showToast(result.message, 'Thành công!', 'success');
                    addProxyForm.reset();
                    setTimeout(() => window.location.reload(), 1500);
                } else {
                    showToast(result.message, 'Có lỗi!', 'error');
                }
            } catch (error) {
                showToast('Không thể kết nối đến server.', 'Lỗi mạng!', 'error');
            } finally {
                addProxyBtn.disabled = false;
                addProxyBtn.querySelector('.btn-text').classList.remove('hidden');
                addProxyBtn.querySelector('.spinner').classList.add('hidden');
            }
        });
    }

    // Edit Proxy Modal
    const editProxyModal = document.getElementById('edit-proxy-modal');
    document.querySelectorAll('.btn-edit-proxy').forEach(btn => {
        btn.addEventListener('click', () => {
            const { id, proxyString, status, notes } = btn.dataset;
            const form = document.getElementById('edit-proxy-form');
            form.querySelector('#edit-proxy-id').value = id;
            form.querySelector('#edit-proxyString').value = proxyString;
            form.querySelector('#edit-status').value = status;
            form.querySelector('#edit-notes').value = notes;
            showModal(editProxyModal);
        });
    });

    document.getElementById('edit-proxy-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const id = form.querySelector('#edit-proxy-id').value;
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        try {
            const response = await fetch(`/admin/proxies/update/${id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await response.json();
            if (result.success) {
                showToast(result.message, 'Thành công!', 'success');
                hideModal(editProxyModal);
                setTimeout(() => window.location.reload(), 1500);
            } else {
                showToast(result.message, 'Có lỗi!', 'error');
            }
        } catch (error) {
            showToast('Không thể kết nối đến server.', 'Lỗi mạng!', 'error');
        }
    });

    // Bulk actions logic
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    const itemCheckboxes = document.querySelectorAll('.item-checkbox');
    const hardDeleteSelectedBtn = document.getElementById('hardDeleteSelectedBtn');
    const softDeleteSelectedBtn = document.getElementById('softDeleteSelectedBtn');
    const restoreSelectedBtn = document.getElementById('restoreSelectedBtn');
    const checkSelectedBtn = document.getElementById('checkSelectedBtn');
    const checkSelectedIcon = document.getElementById('checkSelectedIcon');
    const copySelectedBtn = document.getElementById('copySelectedBtn');
    const selectAllBanner = document.getElementById('select-all-banner');
    const clearSelectionBanner = document.getElementById('clear-selection-banner');
    const selectAllMatchingItemsLink = document.getElementById('select-all-matching-items');
    const clearSelectionLink = document.getElementById('clear-selection');
    const itemsOnPageCountSpan = document.getElementById('items-on-page-count');
    let isSelectAllAcrossPages = false;
    let isCheckProxyRunning = false;

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
        if (copySelectedBtn) copySelectedBtn.disabled = !anyChecked;

        if (isCheckProxyRunning) {
            if (checkSelectedBtn) checkSelectedBtn.disabled = true;
            if (checkSelectedIcon) checkSelectedIcon.classList.add('animate-spin');
        } else {
            if (checkSelectedBtn) checkSelectedBtn.disabled = !anyChecked;
            if (checkSelectedIcon) checkSelectedIcon.classList.remove('animate-spin');
        }
    }

    if (selectAllCheckbox) { selectAllCheckbox.addEventListener('change', (e) => { isSelectAllAcrossPages = false; itemCheckboxes.forEach(cb => cb.checked = e.target.checked); toggleActionButtons(); updateBanners(); }); }
    itemCheckboxes.forEach(cb => { cb.addEventListener('change', () => { isSelectAllAcrossPages = false; if (selectAllCheckbox) selectAllCheckbox.checked = [...itemCheckboxes].every(c => c.checked); toggleActionButtons(); updateBanners(); }); });
    if (selectAllMatchingItemsLink) { selectAllMatchingItemsLink.addEventListener('click', (e) => { e.preventDefault(); isSelectAllAcrossPages = true; toggleActionButtons(); updateBanners(); }); }
    if (clearSelectionLink) { clearSelectionLink.addEventListener('click', (e) => { e.preventDefault(); isSelectAllAcrossPages = false; if (selectAllCheckbox) selectAllCheckbox.checked = false; itemCheckboxes.forEach(cb => cb.checked = false); toggleActionButtons(); updateBanners(); }); }
    
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
            if (url.includes('check-selected')) {
                isCheckProxyRunning = true;
                toggleActionButtons();
            }
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const result = await response.json();
                if (result.success) {
                    showToast(result.message, 'Thành công!', 'success');
                    if (!url.includes('check-selected')) {
                        setTimeout(() => window.location.reload(), 1000);
                    }
                } else {
                    showToast(result.message || 'Có lỗi xảy ra.', 'Lỗi!', 'error');
                    if (url.includes('check-selected')) {
                        isCheckProxyRunning = false;
                        toggleActionButtons();
                    }
                }
            } catch (error) {
                showToast('Lỗi kết nối.', 'Lỗi mạng!', 'error');
                if (url.includes('check-selected')) {
                    isCheckProxyRunning = false;
                    toggleActionButtons();
                }
            }
        }
    }

    if (hardDeleteSelectedBtn) {
        hardDeleteSelectedBtn.addEventListener('click', () => {
            handleBulkAction('/admin/proxies/hard-delete', (count) => `Bạn có chắc muốn XÓA VĨNH VIỄN ${count} proxy?`, 'danger');
        });
    }

    if (softDeleteSelectedBtn) {
        softDeleteSelectedBtn.addEventListener('click', () => {
            handleBulkAction('/admin/proxies/soft-delete', (count) => `Bạn có chắc muốn chuyển ${count} proxy vào thùng rác?`);
        });
    }

    if (restoreSelectedBtn) {
        restoreSelectedBtn.addEventListener('click', () => {
            handleBulkAction('/admin/proxies/restore', (count) => `Bạn có chắc muốn khôi phục ${count} proxy?`, 'info');
        });
    }

    if (checkSelectedBtn) {
        checkSelectedBtn.addEventListener('click', () => {
            handleBulkAction('/admin/proxies/check-selected', (count) => `Bắt đầu tiến trình kiểm tra cho ${count} proxy?`, 'info');
        });
    }

    if (copySelectedBtn) {
        copySelectedBtn.addEventListener('click', async () => {
            let proxiesToCopy = [];
            if (isSelectAllAcrossPages) {
                try {
                    const response = await fetch('/admin/proxies/all', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ filters: JSON.parse(document.body.dataset.currentQuery) })
                    });
                    const result = await response.json();
                    if (result.success) {
                        proxiesToCopy = result.proxies;
                    } else {
                        throw new Error(result.message);
                    }
                } catch (error) {
                    showToast('Không thể lấy danh sách proxy để copy.', 'Lỗi!', 'error');
                    return;
                }
            } else {
                proxiesToCopy = [...itemCheckboxes]
                    .filter(cb => cb.checked)
                    .map(cb => cb.dataset.proxyString);
            }

            if (proxiesToCopy.length === 0) {
                showToast('Vui lòng chọn ít nhất một proxy để copy.', 'Cảnh báo!', 'warning');
                return;
            }

            const proxyText = proxiesToCopy.join('\n');
            navigator.clipboard.writeText(proxyText).then(() => {
                showToast(`Đã copy ${proxiesToCopy.length} proxy vào clipboard.`, 'Thành công!', 'success');
            }, () => {
                showToast('Không thể copy vào clipboard.', 'Lỗi!', 'error');
            });
        });
    }

    const socket = io();
    socket.on('proxy:update', (data) => {
        const { id, status, lastCheckedAt } = data;
        const row = document.getElementById(`proxy-row-${id}`);
        if (!row) return;

        const statusBadge = row.querySelector(`#status-${id}`);
        const spinner = row.querySelector(`#spinner-${id}`);
        const lastCheckedCell = row.querySelector(`#lastUsed-${id}`);

        const isChecking = status === 'CHECKING';
        spinner.style.display = isChecking ? 'inline-block' : 'none';
        statusBadge.style.display = isChecking ? 'none' : 'inline-block';

        if (!isChecking) {
            statusBadge.textContent = status;
            let statusClass = 'bg-gray-700 text-gray-300';
            if (status === 'AVAILABLE') statusClass = 'bg-green-500/20 text-green-400';
            if (status === 'DEAD') statusClass = 'bg-red-500/20 text-red-400';
            if (status === 'UNCHECKED') statusClass = 'bg-gray-500/20 text-gray-300';
            statusBadge.className = `px-2.5 py-1 text-xs font-semibold rounded-full ${statusClass}`;
        }
        if (lastCheckedCell && lastCheckedAt) {
            lastCheckedCell.textContent = lastCheckedAt;
        }
    });

    socket.on('checkproxy:end', () => {
        isCheckProxyRunning = false;
        toggleActionButtons();
        showToast('Tiến trình kiểm tra proxy đã hoàn tất!', 'Hoàn thành', 'success');
    });
    socket.on('proxy:trashed', (data) => {
        const { id, message } = data;
        const row = document.getElementById(`proxy-row-${id}`);
        if (row) {
            row.remove();
            showToast(message, 'Thông báo', 'warning');
        }
    });
    socket.on('proxies:trash:update', (data) => {
        const trashCountSpan = document.getElementById('trash-count');
        if (trashCountSpan) {
            trashCountSpan.textContent = data.newTrashCount;
        }
    });
});