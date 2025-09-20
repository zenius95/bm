document.addEventListener('DOMContentLoaded', () => {
    // Modal logic
    const backdrop = document.getElementById('modal-backdrop');
    const userModal = document.getElementById('user-modal');

    const showModal = (modalEl) => {
        backdrop.classList.remove('hidden');
        modalEl.classList.remove('hidden');
        setTimeout(() => {
            backdrop.classList.remove('opacity-0');
            modalEl.classList.remove('opacity-0', 'scale-95');
        }, 10);
    };

    const hideModal = (modalEl) => {
        backdrop.classList.add('opacity-0');
        modalEl.classList.add('opacity-0', 'scale-95');
        setTimeout(() => {
            backdrop.classList.add('hidden');
            modalEl.classList.add('hidden');
        }, 300);
    };

    backdrop.addEventListener('click', () => hideModal(userModal));
    userModal.querySelectorAll('.btn-cancel').forEach(btn => {
        btn.addEventListener('click', () => hideModal(userModal));
    });

    const userForm = document.getElementById('user-form');
    const modalTitle = document.getElementById('modal-title');
    const passwordHelp = document.getElementById('password-help');
    const balanceSection = document.getElementById('balance-section');
    
    document.getElementById('add-user-btn').addEventListener('click', () => {
        userForm.reset();
        userForm.querySelector('#user-id').value = '';
        modalTitle.textContent = 'Thêm User Mới';
        passwordHelp.style.display = 'none';
        balanceSection.style.display = 'none';
        userForm.querySelector('#user-password').setAttribute('required', 'required');
        showModal(userModal);
    });

    document.querySelectorAll('.btn-edit-user').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const { id, username, email, role, balance } = btn.dataset;
            userForm.reset();
            userForm.querySelector('#user-id').value = id;
            userForm.querySelector('#user-username').value = username;
            userForm.querySelector('#user-email').value = email;
            userForm.querySelector('#user-role').value = role;
            userForm.querySelector('#user-balance').value = parseInt(balance, 10).toLocaleString('vi-VN') + 'đ';
            userForm.querySelector('#balanceAdjustment').value = 0;

            modalTitle.textContent = `Sửa User: ${username}`;
            passwordHelp.style.display = 'block';
            balanceSection.style.display = 'block';
            userForm.querySelector('#user-password').removeAttribute('required');
            showModal(userModal);
        });
    });

    userForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = userForm.querySelector('#user-id').value;
        const url = id ? `/admin/users/update/${id}` : '/admin/users/create';
        const formData = new FormData(userForm);
        const data = Object.fromEntries(formData.entries());

        if (id && !data.password) {
            delete data.password;
        }

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await response.json();
            if (result.success) {
                showToast(result.message, 'Thành công!', 'success');
                hideModal(userModal);
                setTimeout(() => window.location.reload(), 1500);
            } else {
                showToast(result.message, 'Lỗi!', 'error');
            }
        } catch (error) {
            showToast('Lỗi kết nối server.', 'Lỗi mạng!', 'error');
        }
    });

    // Bulk actions
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
            if (selectAllCheckbox) {
                selectAllCheckbox.checked = [...itemCheckboxes].every(c => c.checked);
            }
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
    
    async function handleBulkAction(url, confirmMessage, confirmType = 'warning', selectedIds = []) {
        let payload = {};
        const selectedIdsOnPage = selectedIds.length > 0 ? selectedIds : [...itemCheckboxes].filter(cb => cb.checked).map(cb => cb.value);
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
                    if (payload.selectAll) {
                        setTimeout(() => window.location.reload(), 1000);
                    } else {
                        payload.ids.forEach(id => {
                            const row = document.getElementById(`user-row-${id}`);
                            if (row) row.remove();
                        });
                        if (selectAllCheckbox) selectAllCheckbox.checked = false;
                        toggleActionButtons();
                        updateBanners();
                    }
                } else {
                    showToast(result.message || 'Có lỗi xảy ra từ server.', 'Lỗi!', 'error');
                }
            } catch (error) {
                showToast('Lỗi kết nối hoặc phản hồi không hợp lệ.', 'Lỗi!', 'error');
            }
        }
    }
    
    document.querySelectorAll('.btn-delete-user').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            const { id, username } = btn.dataset;
            handleBulkAction(
                '/admin/users/hard-delete', 
                () => `Bạn có chắc muốn XÓA VĨNH VIỄN user "${username}"?`, 
                'danger',
                [id]
            );
        });
    });

    if (hardDeleteSelectedBtn) {
        hardDeleteSelectedBtn.addEventListener('click', () => {
            handleBulkAction(
                '/admin/users/hard-delete', 
                (count) => `HÀNH ĐỘNG NGUY HIỂM!\nBạn có chắc muốn XÓA VĨNH VIỄN ${count} user? Dữ liệu sẽ không thể phục hồi.`, 
                'danger'
            );
        });
    }
        
    // Dropdown Logic for action buttons
    document.querySelectorAll('.btn-toggle-dropdown').forEach(button => {
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            const menu = button.nextElementSibling;
            document.querySelectorAll('.dropdown-menu').forEach(otherMenu => {
                if (otherMenu !== menu) {
                    otherMenu.classList.add('hidden');
                }
            });
            menu.classList.toggle('hidden');
        });
    });

    document.addEventListener('click', (event) => {
        if (!event.target.closest('.dropdown-container')) {
            document.querySelectorAll('.dropdown-menu').forEach(menu => {
                menu.classList.add('hidden');
            });
        }
    });

    toggleActionButtons();
});