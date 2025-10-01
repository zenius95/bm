// public/js/admin/accounts.js
document.addEventListener('DOMContentLoaded', () => {
    const addAccountsForm = document.getElementById('add-accounts-form');
    if (addAccountsForm) {
        const addAccountsBtn = document.getElementById('add-accounts-btn');
        addAccountsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            addAccountsBtn.disabled = true;
            addAccountsBtn.querySelector('.btn-text').classList.add('hidden');
            addAccountsBtn.querySelector('.spinner').classList.remove('hidden');
            try {
                const response = await fetch('/admin/accounts/add-multiple', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        accountsData: document.getElementById('accountsData').value,
                        accountType: document.getElementById('accountType').value 
                    })
                });
                const result = await response.json();
                if (response.ok && result.success) {
                    showToast(result.message, 'Thành công!', 'success');
                    addAccountsForm.reset();
                    setTimeout(() => {
                        const url = new URL(window.location);
                        url.searchParams.delete('error');
                        url.searchParams.delete('success');
                        window.location.href = url.toString();
                    }, 1000);
                } else {
                    showToast(result.message, `Lỗi (Code: ${response.status})`, 'error');
                }
            } catch (error) {
                showToast('Không thể kết nối đến server.', 'Lỗi mạng!', 'error');
            } finally {
                addAccountsBtn.disabled = false;
                addAccountsBtn.querySelector('.btn-text').classList.remove('hidden');
                addAccountsBtn.querySelector('.spinner').classList.add('hidden');
            }
        });
    }

    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    const itemCheckboxes = document.querySelectorAll('.item-checkbox');
    const checkSelectedBtn = document.getElementById('checkSelectedBtn');
    const checkSelectedIcon = document.getElementById('checkSelectedIcon');
    const softDeleteSelectedBtn = document.getElementById('softDeleteSelectedBtn');
    const restoreSelectedBtn = document.getElementById('restoreSelectedBtn');
    const hardDeleteSelectedBtn = document.getElementById('hardDeleteSelectedBtn');
    const copySelectedBtn = document.getElementById('copySelectedBtn');
    const selectAllBanner = document.getElementById('select-all-banner');
    const clearSelectionBanner = document.getElementById('clear-selection-banner');
    const selectAllMatchingItemsLink = document.getElementById('select-all-matching-items');
    const clearSelectionLink = document.getElementById('clear-selection');
    const itemsOnPageCountSpan = document.getElementById('items-on-page-count');
    let isSelectAllAcrossPages = false;
    let isCheckLiveRunning = false;

    // --- START: SỬA LỖI ---
    // Hợp nhất logic cập nhật giao diện vào một hàm duy nhất
    function updateSelectionState() {
        // Xác định xem có mục nào được chọn không (trên trang hoặc trên tất cả các trang)
        const anyChecked = [...itemCheckboxes].some(cb => cb.checked) || isSelectAllAcrossPages;

        // Cập nhật trạng thái các nút hành động
        if (checkSelectedBtn) {
            if (isCheckLiveRunning) {
                checkSelectedBtn.disabled = true;
                if (checkSelectedIcon) checkSelectedIcon.classList.add('animate-spin');
            } else {
                checkSelectedBtn.disabled = !anyChecked;
                if (checkSelectedIcon) checkSelectedIcon.classList.remove('animate-spin');
            }
        }
        if (softDeleteSelectedBtn) softDeleteSelectedBtn.disabled = !anyChecked;
        if (restoreSelectedBtn) restoreSelectedBtn.disabled = !anyChecked;
        if (hardDeleteSelectedBtn) hardDeleteSelectedBtn.disabled = !anyChecked;
        if (copySelectedBtn) copySelectedBtn.disabled = !anyChecked;

        // Cập nhật trạng thái các banner thông báo
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

    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (e) => {
            isSelectAllAcrossPages = false;
            itemCheckboxes.forEach(cb => cb.checked = e.target.checked);
            updateSelectionState(); // Luôn gọi hàm cập nhật chung
        });
    }

    itemCheckboxes.forEach(cb => {
        cb.addEventListener('change', () => {
            isSelectAllAcrossPages = false;
            if (selectAllCheckbox) selectAllCheckbox.checked = [...itemCheckboxes].every(c => c.checked);
            updateSelectionState(); // Luôn gọi hàm cập nhật chung
        });
    });

    if (selectAllMatchingItemsLink) {
        selectAllMatchingItemsLink.addEventListener('click', (e) => {
            e.preventDefault();
            isSelectAllAcrossPages = true;
            updateSelectionState(); // Luôn gọi hàm cập nhật chung
        });
    }

    if (clearSelectionLink) {
        clearSelectionLink.addEventListener('click', (e) => {
            e.preventDefault();
            isSelectAllAcrossPages = false;
            if (selectAllCheckbox) selectAllCheckbox.checked = false;
            itemCheckboxes.forEach(cb => cb.checked = false);
            updateSelectionState(); // Luôn gọi hàm cập nhật chung
        });
    }
    // --- END: SỬA LỖI ---


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
            if (url.includes('check-selected')) {
                isCheckLiveRunning = true;
                updateSelectionState();
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
                    if (url.includes('delete') || url.includes('restore')) {
                        setTimeout(() => {
                            const currentUrl = new URL(window.location);
                            currentUrl.searchParams.delete('success');
                            currentUrl.searchParams.delete('error');
                            window.location.href = currentUrl.toString();
                        }, 1000);
                    }
                } else {
                    showToast(result.message || 'Có lỗi xảy ra từ server.', 'Lỗi!', 'error');
                    if (url.includes('check-selected')) {
                        isCheckLiveRunning = false;
                        updateSelectionState();
                    }
                }
            } catch (error) {
                showToast('Lỗi kết nối hoặc phản hồi không hợp lệ.', 'Lỗi!', 'error');
                if (url.includes('check-selected')) {
                    isCheckLiveRunning = false;
                    updateSelectionState();
                }
            }
        }
    }

    if (softDeleteSelectedBtn) {
        softDeleteSelectedBtn.addEventListener('click', () => {
            handleAction('/admin/accounts/soft-delete', (count) => `Bạn có chắc muốn chuyển ${count} account vào thùng rác?`);
        });
    }
    if (restoreSelectedBtn) {
        restoreSelectedBtn.addEventListener('click', () => {
            handleAction('/admin/accounts/restore', (count) => `Bạn có chắc muốn khôi phục ${count} account?`, 'info');
        });
    }
    if (hardDeleteSelectedBtn) {
        hardDeleteSelectedBtn.addEventListener('click', () => {
            handleAction('/admin/accounts/hard-delete', (count) => `HÀNH ĐỘNG NGUY HIỂM!\nBạn có chắc muốn XÓA VĨNH VIỄN ${count} account? Dữ liệu sẽ không thể phục hồi.`, 'danger');
        });
    }
    if (checkSelectedBtn) {
        checkSelectedBtn.addEventListener('click', () => {
            handleAction('/admin/accounts/check-selected', (count) => `Bắt đầu tiến trình check live cho ${count} account?`, 'info');
        });
    }

    if (copySelectedBtn) {
        copySelectedBtn.addEventListener('click', async () => {
            let accountsToFormat = [];

            if (isSelectAllAcrossPages) {
                try {
                    const response = await fetch('/admin/accounts/all', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ filters: JSON.parse(document.body.dataset.currentQuery) })
                    });
                    const result = await response.json();
                    if (result.success) {
                        accountsToFormat = result.accounts;
                    } else {
                        throw new Error(result.message);
                    }
                } catch (error) {
                    showToast('Không thể lấy danh sách account để copy.', 'Lỗi!', 'error');
                    return;
                }
            } else {
                const accountIdsToCopy = [...itemCheckboxes]
                    .filter(cb => cb.checked)
                    .map(cb => cb.value);

                if (accountIdsToCopy.length === 0) {
                    showToast('Vui lòng chọn ít nhất một account để copy.', 'Cảnh báo!', 'warning');
                    return;
                }

                try {
                    const response = await fetch('/admin/accounts/details', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ids: accountIdsToCopy })
                    });
                    const result = await response.json();
                    if (result.success) {
                        accountsToFormat = result.accounts;
                    } else {
                        throw new Error(result.message);
                    }
                } catch (error) {
                    showToast('Không thể lấy chi tiết account để copy.', 'Lỗi!', 'error');
                }
            }
            
            if (accountsToFormat.length === 0) {
                 showToast('Không có account nào để copy.', 'Thông báo', 'info');
                 return;
            }
            
            const accountText = accountsToFormat.map(acc => {
                const parts = [acc.uid, acc.password, acc.twofa];
                if (acc.email) parts.push(acc.email);
                return parts.join('|');
            }).join('\n');

            navigator.clipboard.writeText(accountText).then(() => {
                showToast(`Đã copy ${accountsToFormat.length} account vào clipboard.`, 'Thành công!', 'success');
            }, () => {
                showToast('Không thể copy vào clipboard.', 'Lỗi!', 'error');
            });
        });
    }

    const socket = io();
    socket.on('connect', () => console.log('Connected to server via WebSocket.'));
    socket.on('account:update', (data) => {
        const { id, status, lastCheckedAt, dieStreak, proxy } = data;
        const statusBadge = document.getElementById(`status-${id}`);
        const spinner = document.getElementById(`spinner-${id}`);
        const lastCheckedCell = document.getElementById(`lastUsed-${id}`);
        const dieStreakCell = document.querySelector(`#account-row-${id} td:nth-child(8)`); // Assuming dieStreak is 8th column
        const proxyCell = document.getElementById(`proxy-cell-${id}`);

        if (!statusBadge || !spinner) return;

        const isChecking = status === 'CHECKING';

        spinner.style.display = isChecking ? 'inline-block' : 'none';
        statusBadge.style.display = isChecking ? 'none' : 'inline-block';

        if (!isChecking) {
            statusBadge.textContent = status;
            let statusClass = 'bg-gray-700 text-gray-300';
            if (status === 'LIVE') statusClass = 'bg-green-500/20 text-green-400';
            if (status === 'DIE' || status === 'ERROR') statusClass = 'bg-red-500/20 text-red-400';
            if (status === 'IN_USE') statusClass = 'bg-purple-500/20 text-purple-400';
            statusBadge.className = `px-2.5 py-1 text-xs font-semibold rounded-full ${statusClass}`;
        }

        if (lastCheckedCell && lastCheckedAt) {
            lastCheckedCell.textContent = lastCheckedAt;
        }

        if (dieStreakCell && typeof dieStreak !== 'undefined') {
            dieStreakCell.textContent = dieStreak;
        }

        if (proxyCell && typeof proxy !== 'undefined') {
            proxyCell.textContent = proxy || 'N/A';
        }
    });

    socket.on('account:trashed', (data) => {
        const { id, message } = data;
        const row = document.getElementById(`account-row-${id}`);
        if (row) {
            row.remove();
            showToast(message, 'Tự động xóa', 'warning');
        }
    });
    socket.on('checklive:end', () => {
        isCheckLiveRunning = false;
        updateSelectionState();
        showToast('Tiến trình Check Live đã hoàn tất!', 'Hoàn thành', 'success');
    });
    socket.on('accounts:trash:update', (data) => {
        const trashCountSpan = document.getElementById('trash-count');
        if (trashCountSpan) {
            trashCountSpan.textContent = data.newTrashCount;
        }
    });
    
    // Khởi tạo trạng thái ban đầu khi tải trang
    updateSelectionState();
});