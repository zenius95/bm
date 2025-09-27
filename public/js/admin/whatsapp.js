// public/js/admin/whatsapp.js
document.addEventListener('DOMContentLoaded', () => {
    // --- Modal Logic ---
    const backdrop = document.getElementById('modal-backdrop');
    const qrModal = document.getElementById('qr-modal');
    const showModal = (modalEl) => { backdrop.classList.remove('hidden'); modalEl.classList.remove('hidden'); setTimeout(() => { backdrop.classList.remove('opacity-0'); modalEl.classList.remove('opacity-0', 'scale-95'); }, 10); };
    const hideModal = (modalEl) => { if (!modalEl) return; backdrop.classList.add('opacity-0'); modalEl.classList.add('opacity-0', 'scale-95'); setTimeout(() => { backdrop.classList.add('hidden'); modalEl.classList.add('hidden'); }, 300); };
    backdrop.addEventListener('click', () => document.querySelectorAll('.modal-container').forEach(hideModal));
    document.querySelectorAll('.btn-cancel').forEach(btn => btn.addEventListener('click', () => hideModal(btn.closest('.modal-container'))));

    // --- Add New Logic ---
    const addWhatsappBtn = document.getElementById('add-whatsapp-btn');
    if (addWhatsappBtn) {
        addWhatsappBtn.addEventListener('click', async () => {
            addWhatsappBtn.disabled = true;
            addWhatsappBtn.querySelector('.btn-text').classList.add('hidden');
            addWhatsappBtn.querySelector('.spinner').classList.remove('hidden');
            try {
                const response = await fetch('/admin/whatsapp/initiate', { method: 'POST' });
                const result = await response.json();
                if (!result.success) { throw new Error(result.message); }
                showToast(result.message, 'Đang xử lý', 'info');
            } catch (error) {
                showToast(`Không thể bắt đầu phiên: ${error.message}`, 'Lỗi!', 'error');
                addWhatsappBtn.disabled = false;
                addWhatsappBtn.querySelector('.btn-text').classList.remove('hidden');
                addWhatsappBtn.querySelector('.spinner').classList.add('hidden');
            }
        });
    }

    // --- Bulk Actions Logic ---
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    const itemCheckboxes = document.querySelectorAll('.item-checkbox');
    const softDeleteSelectedBtn = document.getElementById('softDeleteSelectedBtn');
    const restoreSelectedBtn = document.getElementById('restoreSelectedBtn');
    const hardDeleteSelectedBtn = document.getElementById('hardDeleteSelectedBtn');
    const checkSelectedBtn = document.getElementById('checkSelectedBtn');
    const checkSelectedIcon = document.getElementById('checkSelectedIcon');
    const selectAllBanner = document.getElementById('select-all-banner');
    const clearSelectionBanner = document.getElementById('clear-selection-banner');
    const selectAllMatchingItemsLink = document.getElementById('select-all-matching-items');
    const clearSelectionLink = document.getElementById('clear-selection');
    const itemsOnPageCountSpan = document.getElementById('items-on-page-count');
    let isSelectAllAcrossPages = false;
    let isCheckWhatsappRunning = false;

    function updateBanners() { if (!selectAllBanner) return; const allCheckedOnPage = itemCheckboxes.length > 0 && [...itemCheckboxes].every(cb => cb.checked); if (isSelectAllAcrossPages) { selectAllBanner.classList.add('hidden'); clearSelectionBanner.classList.remove('hidden'); } else if (allCheckedOnPage) { itemsOnPageCountSpan.textContent = itemCheckboxes.length; selectAllBanner.classList.remove('hidden'); clearSelectionBanner.classList.add('hidden'); } else { selectAllBanner.classList.add('hidden'); clearSelectionBanner.classList.add('hidden'); } }
    function toggleActionButtons() {
        const anyChecked = [...itemCheckboxes].some(cb => cb.checked) || isSelectAllAcrossPages;
        if (softDeleteSelectedBtn) softDeleteSelectedBtn.disabled = !anyChecked;
        if (restoreSelectedBtn) restoreSelectedBtn.disabled = !anyChecked;
        if (hardDeleteSelectedBtn) hardDeleteSelectedBtn.disabled = !anyChecked;
        if (checkSelectedBtn) { if (isCheckWhatsappRunning) { checkSelectedBtn.disabled = true; if (checkSelectedIcon) checkSelectedIcon.classList.add('animate-spin'); } else { checkSelectedBtn.disabled = !anyChecked; if (checkSelectedIcon) checkSelectedIcon.classList.remove('animate-spin'); } }
    }
    if (selectAllCheckbox) { selectAllCheckbox.addEventListener('change', (e) => { isSelectAllAcrossPages = false; itemCheckboxes.forEach(cb => cb.checked = e.target.checked); toggleActionButtons(); updateBanners(); }); }
    itemCheckboxes.forEach(cb => { cb.addEventListener('change', () => { isSelectAllAcrossPages = false; if (selectAllCheckbox) selectAllCheckbox.checked = [...itemCheckboxes].every(c => c.checked); toggleActionButtons(); updateBanners(); }); });
    if (selectAllMatchingItemsLink) { selectAllMatchingItemsLink.addEventListener('click', (e) => { e.preventDefault(); isSelectAllAcrossPages = true; toggleActionButtons(); updateBanners(); }); }
    if (clearSelectionLink) { clearSelectionLink.addEventListener('click', (e) => { e.preventDefault(); isSelectAllAcrossPages = false; if (selectAllCheckbox) selectAllCheckbox.checked = false; itemCheckboxes.forEach(cb => cb.checked = false); toggleActionButtons(); updateBanners(); }); }

    async function handleAction(url, confirmMessage, confirmType = 'warning') {
        let payload = {};
        const selectedIdsOnPage = [...itemCheckboxes].filter(cb => cb.checked).map(cb => cb.value);
        if (isSelectAllAcrossPages) { payload = { selectAll: true, filters: JSON.parse(document.body.dataset.currentQuery) }; } else { if (selectedIdsOnPage.length === 0) return showToast('Vui lòng chọn ít nhất một mục.', 'Cảnh báo!', 'warning'); payload = { ids: selectedIdsOnPage }; }
        const totalCount = isSelectAllAcrossPages ? parseInt(document.body.dataset.totalItems, 10) : selectedIdsOnPage.length;
        const confirmed = await showConfirm(confirmMessage(totalCount), confirmType);
        if (confirmed) {
            if (url.includes('check-selected')) { isCheckWhatsappRunning = true; toggleActionButtons(); }
            try {
                const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                const result = await response.json();
                if (result.success) {
                    showToast(result.message, 'Thành công!', 'success');
                    if (!url.includes('check-selected')) setTimeout(() => window.location.reload(), 1500);
                } else {
                    showToast(result.message, 'Lỗi!', 'error');
                    if (url.includes('check-selected')) { isCheckWhatsappRunning = false; toggleActionButtons(); }
                }
            } catch (error) {
                showToast('Lỗi kết nối server.', 'Lỗi!', 'error');
                if (url.includes('check-selected')) { isCheckWhatsappRunning = false; toggleActionButtons(); }
            }
        }
    }

    if (softDeleteSelectedBtn) { softDeleteSelectedBtn.addEventListener('click', () => handleAction('/admin/whatsapp/soft-delete', (c) => `Bạn có chắc muốn chuyển ${c} phiên vào thùng rác?`)); }
    if (restoreSelectedBtn) { restoreSelectedBtn.addEventListener('click', () => handleAction('/admin/whatsapp/restore', (c) => `Bạn có chắc muốn khôi phục ${c} phiên?`, 'info')); }
    if (hardDeleteSelectedBtn) { hardDeleteSelectedBtn.addEventListener('click', () => handleAction('/admin/whatsapp/hard-delete', (c) => `XÓA VĨNH VIỄN ${c} phiên? Hành động này không thể hoàn tác.`, 'danger')); }
    if (checkSelectedBtn) { checkSelectedBtn.addEventListener('click', () => handleAction('/admin/whatsapp/check-selected', (c) => `Bắt đầu kiểm tra ${c} phiên WhatsApp?`, 'info')); }
    toggleActionButtons();

    // --- Socket.IO Logic ---
    const socket = io();
    socket.on('whatsapp:qr', (data) => {
        const { qrDataURL } = data;
        const qrContainer = document.getElementById('qr-code-container');
        if (qrContainer) { qrContainer.innerHTML = `<img src="${qrDataURL}" alt="QR Code">`; showModal(qrModal); }
        if(addWhatsappBtn) { addWhatsappBtn.disabled = false; addWhatsappBtn.querySelector('.btn-text').classList.remove('hidden'); addWhatsappBtn.querySelector('.spinner').classList.add('hidden'); }
    });
    socket.on('whatsapp:init_failed', (data) => {
        showToast(`Khởi tạo thất bại: ${data.message}`, 'Lỗi!', 'error');
        hideModal(qrModal);
        if(addWhatsappBtn) { addWhatsappBtn.disabled = false; addWhatsappBtn.querySelector('.btn-text').classList.remove('hidden'); addWhatsappBtn.querySelector('.spinner').classList.add('hidden'); }
    });
    socket.on('whatsapp:session_created', (newSession) => {
        hideModal(qrModal);
        showToast(`Đã kết nối thành công với SĐT: ${newSession.phoneNumber}`, 'Thành công!', 'success');
        const tableBody = document.getElementById('whatsapp-table-body');
        const noDataRow = document.getElementById('no-whatsapp-row');
        if (noDataRow) noDataRow.remove();
        const newRow = document.createElement('tr');
        newRow.id = `wa-row-${newSession._id}`;
        newRow.dataset.sessionId = newSession.sessionId;
        newRow.className = 'border-b border-white/10 hover:bg-white/5 transition-colors duration-200';
        newRow.innerHTML = `
            <td class="p-4"><input type="checkbox" value="${newSession._id}" class="item-checkbox w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-600 focus:ring-2"></td>
            <td class="px-6 py-4 font-mono text-gray-400">${newSession.sessionId}</td>
            <td id="wa-phone-${newSession._id}" class="px-6 py-4 font-mono text-white">${newSession.phoneNumber}</td>
            <td class="px-6 py-4"><div id="wa-status-container-${newSession._id}" class="flex items-center"><span class="px-2.5 py-1 text-xs font-semibold rounded-full bg-green-500/20 text-green-400 flex items-center gap-2"><i class="ri-checkbox-circle-line"></i><span>CONNECTED</span></span></div></td>
            <td class="px-6 py-4 text-gray-400">${new Date(newSession.updatedAt).toLocaleString('vi-VN')}</td>
        `;
        tableBody.prepend(newRow);
    });
    socket.on('whatsapp:update', (data) => {
        const { id, status, phoneNumber, lastCheckedAt } = data;
        updateStatusUI(id, status, phoneNumber, lastCheckedAt);
    });
    socket.on('checkwhatsapp:end', () => {
        isCheckWhatsappRunning = false;
        toggleActionButtons();
        showToast('Đã hoàn thành kiểm tra WhatsApp!', 'Hoàn thành', 'success');
    });

    function updateStatusUI(sessionId, status, phoneNumber = null, lastCheckedAt = null) {
        const row = document.querySelector(`tr[data-session-id="${sessionId}"]`);
        if (!row) return;
        const dbId = row.id.replace('wa-row-','');
        const statusContainer = document.getElementById(`wa-status-container-${dbId}`);
        const phoneCell = document.getElementById(`wa-phone-${dbId}`);
        const lastCheckedCell = document.getElementById(`wa-last-checked-${dbId}`);
        if (!statusContainer) return;

        let config = { text: 'DISCONNECTED', color: 'red', icon: 'ri-close-circle-line' };
        if (status === 'CONNECTED') config = { text: 'CONNECTED', color: 'green', icon: 'ri-checkbox-circle-line' };
        if (status === 'SCAN_QR') config = { text: 'SCAN QR', color: 'yellow', icon: 'ri-qr-scan-2-line' };
        if (status === 'LOADING') config = { text: 'LOADING', color: 'blue', icon: 'ri-loader-4-line animate-spin' };

        statusContainer.innerHTML = `<span class="px-2.5 py-1 text-xs font-semibold rounded-full bg-${config.color}-500/20 text-${config.color}-400 flex items-center gap-2"><i class="${config.icon}"></i><span id="wa-status-${dbId}">${config.text}</span></span>`;

        if (phoneCell && phoneNumber) phoneCell.textContent = phoneNumber;
        if (phoneCell && status === 'DISCONNECTED') phoneCell.textContent = 'N/A';
        if (lastCheckedCell && lastCheckedAt) lastCheckedCell.textContent = lastCheckedAt;
    }
});