document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    const userId = document.body.dataset.userId;

    socket.on('connect', () => {
        const userRoom = `user_${userId}`;
        socket.emit('join_room', userRoom);
        console.log(`Connected to socket and joined room: ${userRoom}`);
    });

    socket.on('order:update', (data) => {
        const { id, status } = data;
        const statusBadge = document.getElementById(`status-badge-${id}`);
        if (!statusBadge) return;

        let statusConfig = { text: 'Pending', color: 'gray' };
        if (status === 'processing') statusConfig = { text: 'Processing', color: 'yellow' };
        if (status === 'completed') statusConfig = { text: 'Completed', color: 'green' };
        if (status === 'failed') statusConfig = { text: 'Failed', color: 'red' };

        statusBadge.textContent = statusConfig.text;
        statusBadge.className = `px-2.5 py-1 text-xs font-semibold rounded-full bg-${statusConfig.color}-500/20 text-${statusConfig.color}-300`;
    });

    socket.on('order:item_update', (data) => {
        const { id, completedItems, failedItems } = data;
        const orderCard = document.getElementById(`order-card-${id}`);
        if (!orderCard) return;

        const completedEl = orderCard.querySelector('.item-completed-count');
        const failedEl = orderCard.querySelector('.item-failed-count');

        if (completedEl) completedEl.textContent = completedItems;
        if (failedEl) failedEl.textContent = failedItems;
    });
});