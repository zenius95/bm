document.addEventListener('DOMContentLoaded', () => {
    // Modal Logic
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
        backdrop.classList.add('opacity-0');
        modalEl.classList.add('opacity-0', 'scale-95');
        setTimeout(() => {
            backdrop.classList.add('hidden');
            modalEl.classList.add('hidden');
        }, 300);
    };
    backdrop.addEventListener('click', () => document.querySelectorAll('.modal-container').forEach(hideModal));
    document.querySelectorAll('.btn-cancel').forEach(btn => btn.addEventListener('click', () => hideModal(btn.closest('.modal-container'))));

    // Add Worker Modal
    const addWorkerModal = document.getElementById('add-worker-modal');
    document.getElementById('add-worker-btn').addEventListener('click', () => showModal(addWorkerModal));
    document.getElementById('add-worker-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        try {
            const response = await fetch('/admin/workers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await response.json();
            if (result.success) {
                showToast(result.message, 'Thành công!', 'success');
                hideModal(addWorkerModal);
                setTimeout(() => window.location.reload(), 1500);
            } else {
                showToast(result.message, 'Lỗi!', 'error');
            }
        } catch (error) {
            showToast('Không thể kết nối đến server.', 'Lỗi mạng!', 'error');
        }
    });

    // Event Delegation for Worker Cards
    document.getElementById('worker-list').addEventListener('click', async (e) => {
        const card = e.target.closest('.flex-col');
        if (!card) return;

        const { id, name, url, apiKey, isLocal, concurrency } = card.dataset;
        const isEnabled = card.dataset.isEnabled === 'true';
        const isLocalBool = (isLocal === 'true');

        if (e.target.closest('.btn-toggle-dropdown')) {
            e.stopPropagation();
            const menu = card.querySelector('.dropdown-menu');
            document.querySelectorAll('.dropdown-menu').forEach(otherMenu => {
                if(otherMenu !== menu) otherMenu.classList.add('hidden');
            });
            menu.classList.toggle('hidden');
        }
        
        if (e.target.closest('.btn-edit-worker')) {
            e.preventDefault();
            const editWorkerModal = document.getElementById('edit-worker-modal');
            const form = document.getElementById('edit-worker-form');
            form.querySelector('#edit-worker-id').value = id;
            form.querySelector('#edit-worker-name').value = name;
            form.querySelector('#edit-worker-url').value = url;
            form.querySelector('#edit-worker-apiKey').value = apiKey;
            form.querySelector('#edit-worker-concurrency').value = concurrency;
            form.querySelector('#edit-worker-url').disabled = isLocalBool;
            form.querySelector('#edit-worker-apiKey').disabled = isLocalBool;
            
            showModal(editWorkerModal);
            card.querySelector('.dropdown-menu').classList.add('hidden');
        }

        if (e.target.closest('.btn-delete-worker')) {
            e.preventDefault();
            const confirmed = await showConfirm(`Bạn có chắc muốn XÓA VĨNH VIỄN worker "${name}"?`, 'danger');
            if (confirmed) {
                try {
                    const response = await fetch(`/admin/workers/${id}`, { method: 'DELETE' });
                    const result = await response.json();
                    if (result.success) {
                        showToast(result.message, 'Thành công', 'success');
                        card.remove();
                    } else { showToast(result.message, 'Lỗi!', 'error'); }
                } catch (error) { showToast('Lỗi kết nối server.', 'Lỗi mạng!', 'error'); }
            }
        }
        
        if(e.target.closest('.btn-toggle-worker')) {
            const newIsEnabled = !isEnabled;
            try {
                const response = await fetch(`/admin/workers/${id}/toggle`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ isEnabled: newIsEnabled })
                });
                const result = await response.json();
                if(result.success) {
                    showToast(result.message, 'Thành công', 'success');
                    card.dataset.isEnabled = newIsEnabled; 
                    updateWorkerCardUI(card); 
                } else {
                    showToast(result.message, 'Lỗi!', 'error');
                }
            } catch (error) {
                showToast('Lỗi kết nối server.', 'Lỗi mạng!', 'error');
            }
        }

        if (e.target.closest('.btn-view-log')) {
            const logModal = document.getElementById('log-modal');
            document.getElementById('log-worker-name').textContent = name;
            const logContent = document.getElementById('log-content');
            logContent.innerHTML = '<div class="text-gray-500">Đang tải logs...</div>';
            showModal(logModal);
            try {
                const response = await fetch(`/admin/workers/${id}/logs`);
                const result = await response.json();
                if (result.success && result.logs) {
                    logContent.innerHTML = result.logs.length === 0 
                        ? '<div class="text-gray-500">Không có log nào.</div>'
                        : result.logs.map(log => `
                            <div class="flex items-start">
                                <span class="text-gray-500 mr-3">${new Date(log.timestamp).toLocaleTimeString('vi-VN')}</span>
                                <span class="${log.level === 'ERROR' ? 'text-red-400' : 'text-green-400'} font-bold mr-2">[${log.level}]</span>
                                <span class="text-gray-300 flex-1">${log.message}</span>
                            </div>`).join('');
                } else {
                     logContent.innerHTML = `<div class="text-red-400">Lỗi khi tải logs: ${result.message}</div>`;
                }
            } catch (error) {
                 logContent.innerHTML = `<div class="text-red-400">Lỗi kết nối: ${error.message}</div>`;
            }
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.dropdown-container')) {
            document.querySelectorAll('.dropdown-menu').forEach(menu => menu.classList.add('hidden'));
        }
    });

    // Edit Worker Form Submission
    document.getElementById('edit-worker-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const id = form.querySelector('#edit-worker-id').value;
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        try {
            const response = await fetch(`/admin/workers/${id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await response.json();
            if (result.success) {
                showToast(result.message, 'Thành công!', 'success');
                setTimeout(() => window.location.reload(), 1500);
            } else {
                showToast(result.message, 'Lỗi!', 'error');
            }
        } catch (error) {
            showToast('Lỗi kết nối server.', 'Lỗi mạng!', 'error');
        }
    });

    // Real-time Logic
    function updateWorkerCardUI(workerCard) {
        const isEnabled = workerCard.dataset.isEnabled === 'true';
        const isOnline = workerCard.dataset.status === 'online';
        const toggleBtn = workerCard.querySelector('.btn-toggle-worker');
        const statusIndicator = workerCard.querySelector('.status-indicator');
        
        workerCard.classList.toggle('opacity-50', !isEnabled);
        if (toggleBtn) {
            toggleBtn.innerHTML = isEnabled ?
            `<i class="ri-pause-circle-line" title="Tạm dừng Worker"></i>` : `<i class="ri-play-circle-line" title="Tiếp tục Worker"></i>`;
        }
        
        statusIndicator.classList.remove('bg-green-400', 'bg-yellow-400', 'bg-red-400', 'animate-pulse');
        if (isOnline) {
            if (isEnabled) {
                statusIndicator.classList.add('bg-green-400', 'animate-pulse');
                statusIndicator.title = "Online & Active";
            } else {
                 statusIndicator.classList.add('bg-yellow-400');
                 statusIndicator.title = "Paused";
            }
        } else {
            statusIndicator.classList.add('bg-red-400');
            statusIndicator.title = "Offline";
        }
    }
    
    document.querySelectorAll('#worker-list .flex-col').forEach(updateWorkerCardUI);
    
    const socket = io();
    socket.on('workers:update', (workers) => {
        workers.forEach(worker => {
            const workerCard = document.getElementById(`worker-${worker._id}`);
            if (!workerCard) return;

            workerCard.dataset.status = worker.status;
            ['cpu', 'ram', 'processing-items', 'pending-orders', 'live-accounts', 'total-accounts'].forEach(stat => {
                const el = workerCard.querySelector(`.stat-${stat}`);
                if (el) el.textContent = `${worker.stats[stat.replace('-','')] || 0}`;
            });
            
            updateWorkerCardUI(workerCard);
        });
    });
});