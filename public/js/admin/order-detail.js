document.addEventListener('DOMContentLoaded', () => {
    const orderId = document.body.dataset.orderId;
    const socket = io();

    // Modal Elements
    const backdrop = document.getElementById('modal-backdrop');
    const itemLogModal = document.getElementById('item-log-modal');
    const modalItemData = document.getElementById('modal-item-data');
    const modalLogContent = document.getElementById('modal-log-content');
    let currentItemRoom = null;

    const showModal = () => {
        backdrop.classList.remove('hidden');
        itemLogModal.classList.remove('hidden');
        setTimeout(() => {
            backdrop.classList.remove('opacity-0');
            itemLogModal.classList.remove('opacity-0', 'scale-95');
        }, 10);
    };

    const hideModal = () => {
        if (currentItemRoom) {
            socket.emit('leave_room', currentItemRoom);
            currentItemRoom = null;
        }
        backdrop.classList.add('opacity-0');
        itemLogModal.classList.add('opacity-0', 'scale-95');
        setTimeout(() => {
            backdrop.classList.add('hidden');
            itemLogModal.classList.add('hidden');
        }, 300);
    };

    backdrop.addEventListener('click', hideModal);
    itemLogModal.querySelector('.btn-cancel').addEventListener('click', hideModal);

    document.querySelectorAll('tr[data-item-id]').forEach(row => {
        row.addEventListener('click', async () => {
            const itemId = row.dataset.itemId;
            const itemData = row.dataset.itemData;

            modalItemData.textContent = itemData;
            modalLogContent.innerHTML = '<div class="text-gray-500">Fetching history...</div>';
            showModal();

            const scrollToBottom = () => {
                modalLogContent.scrollTop = modalLogContent.scrollHeight;
            };

            try {
                const response = await fetch(`/admin/items/${itemId}/logs`);
                const result = await response.json();
                modalLogContent.innerHTML = '';
                if (result.success && result.logs.length > 0) {
                    appendLogBatch(result.logs, true);
                } else if (!result.success) {
                    modalLogContent.innerHTML = `<div class="text-red-400">Error: ${result.message}</div>`;
                } else {
                     modalLogContent.innerHTML = '<div id="no-logs-message" class="text-gray-500">No historical logs found for this item. Waiting for real-time events...</div>';
                }
            } catch (error) {
                 modalLogContent.innerHTML = `<div class="text-red-400">Connection Error: ${error.message}</div>`;
            }

            currentItemRoom = `item_${itemId}`;
            socket.emit('join_room', currentItemRoom);
            scrollToBottom();
        });
    });

    function appendLogBatch(logs) {
        const noLogsMsg = modalLogContent.querySelector('#no-logs-message');
        if(noLogsMsg) noLogsMsg.remove();

        const fragment = document.createDocumentFragment();
        logs.forEach(log => {
            const logEl = document.createElement('div');
            const timestamp = new Date(log.timestamp).toLocaleTimeString('vi-VN');
            const levelColor = log.level === 'INFO' ? 'text-green-500' : 'text-red-500';

            logEl.innerHTML = `
                <span class="text-gray-600 mr-2">${timestamp}</span>
                <span class="${levelColor} font-bold mr-2">[${log.level}]</span>
                <span class="text-gray-300 whitespace-pre-wrap">${log.message}</span>
            `;
            fragment.appendChild(logEl);
        });

        modalLogContent.appendChild(fragment);
        modalLogContent.scrollTop = modalLogContent.scrollHeight;
    }

    socket.on('connect', () => {
        const orderRoom = `order_${orderId}`;
        socket.emit('join_room', orderRoom);
    });

    socket.on('order:update', (data) => {
        if (data.id !== orderId) return;
        if (data.status === 'completed' || data.status === 'failed') {
            showToast('Đơn hàng đã hoàn tất! Tự động làm mới...', 'Thành công', 'success');
            setTimeout(() => window.location.reload(), 2000);
        } else {
            const orderStatusBadge = document.getElementById("order-status-badge");
            let config = { text: 'pending', color: 'gray' };
            if (data.status === 'processing') config = { text: 'processing', color: 'yellow' };
            orderStatusBadge.textContent = data.status;
            orderStatusBadge.className = `px-3 py-1 text-sm font-semibold rounded-full bg-${config.color}-500/20 text-${config.color}-300`;
        }
    });

    socket.on('order:item_update', (data) => {
        if (data.id !== orderId) return;

        document.getElementById("completed-count").textContent = data.completedItems;
        document.getElementById("failed-count").textContent = data.failedItems;
        document.getElementById("processed-count").textContent = data.completedItems + data.failedItems;

        if (data.item) {
            const itemRow = document.getElementById(`item-row-${data.item._id}`);
            if (itemRow) {
                const statusCell = itemRow.cells[1];
                let itemStatus = { color: 'gray', icon: 'ri-time-line', title: 'Queued' };
                if (data.item.status === 'processing') itemStatus = { color: 'blue', icon: 'ri-loader-4-line animate-spin', title: 'Processing' };
                if (data.item.status === 'completed') itemStatus = { color: 'green', icon: 'ri-check-line', title: 'Completed' };
                if (data.item.status === 'failed') itemStatus = { color: 'red', icon: 'ri-close-line', title: 'Failed' };

                statusCell.innerHTML = `
                    <span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-${itemStatus.color}-500/20 text-${itemStatus.color}-400" title="${itemStatus.title}">
                        <i class="${itemStatus.icon}"></i>
                    </span>
                `;
            }
        }
    });

    socket.on('order:new_logs_batch', (logs) => {
        if (!logs || logs.length === 0) return;
        if (currentItemRoom === `item_${logs[0].itemId}`) {
            appendLogBatch(logs);
        }
    });
});