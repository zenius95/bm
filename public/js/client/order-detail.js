document.addEventListener("DOMContentLoaded", () => {
    const orderId = document.body.dataset.orderId;
    // ELEMENTS
    const completedCountEl = document.getElementById("completed-count");
    const failedCountEl = document.getElementById("failed-count");
    const pendingCountEl = document.getElementById("pending-count");
    const orderStatusBadge = document.getElementById("order-status-badge");
    // FILTERS
    const filterContainer = document.getElementById("item-filters");
    const itemRows = document.querySelectorAll(".item-row");
    const searchInput = document.getElementById("item-search-input");

    function applyFilter() {
        const activeFilter = filterContainer.querySelector(".filter-btn.active")?.dataset.filter || "all";
        const searchTerm = searchInput.value.toLowerCase();
        itemRows.forEach((row) => {
            const status = row.dataset.status;
            const itemData = row.querySelector(".font-mono").textContent.toLowerCase();
            let statusMatch = false;
            if (activeFilter === "all") {
                statusMatch = true;
            } else if (activeFilter === "pending") {
                statusMatch = status === "queued" || status === "processing";
            } else {
                statusMatch = status === activeFilter;
            }
            const searchMatch = itemData.includes(searchTerm);
            row.style.display = statusMatch && searchMatch ? "flex" : "none";
        });
    }

    if (filterContainer) {
        const filterButtons = filterContainer.querySelectorAll(".filter-btn");
        const activeClasses = ["border-blue-500/80", "text-white", "shadow-md", "shadow-blue-500/10", "bg-blue-500/10"];
        const inactiveClasses = ["border-white/10", "bg-white/5", "text-gray-300", "hover:bg-white/10"];
        filterButtons.forEach((button) => {
            button.addEventListener("click", () => {
                const currentActive = filterContainer.querySelector(".filter-btn.active");
                if (currentActive) {
                    currentActive.classList.remove("active", ...activeClasses);
                    currentActive.classList.add(...inactiveClasses);
                }
                button.classList.add("active", ...activeClasses);
                button.classList.remove(...inactiveClasses);
                applyFilter();
            });
        });
    }

    if (searchInput) {
        searchInput.addEventListener("input", applyFilter);
    }

    // COPY ID
    const copyBtn = document.getElementById("copy-order-id-btn");
    const orderIdEl = document.getElementById("order-id-text");
    if (copyBtn && orderIdEl) {
        copyBtn.addEventListener("click", () => {
            const orderIdToCopy = orderIdEl.textContent.trim();
            navigator.clipboard
                .writeText(orderIdToCopy)
                .then(() => {
                    showToast("Đã sao chép ID đơn hàng!");
                    const icon = copyBtn.querySelector("i");
                    icon.className = "ri-check-line";
                    setTimeout(() => {
                        icon.className = "ri-file-copy-line";
                    }, 2000);
                })
                .catch((err) => {
                    showToast("Sao chép thất bại!", "error");
                });
        });
    }

    // SOCKET.IO
    const socket = io();
    socket.on("connect", () => {
        const orderRoom = `order_${orderId}`;
        socket.emit('join_room', orderRoom);
    });

    socket.on("order:update", (data) => {
        if (data.id !== orderId) return;
        if (data.status === 'completed' || data.status === 'failed') {
            showToast('Đơn hàng của bạn đã hoàn tất! Tự động làm mới...', 'Thành công', 'success');
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        } else {
            if (orderStatusBadge) {
                let config = { text: "Pending", color: "gray" };
                if (data.status === "processing") config = { text: "Processing", color: "yellow" };
                orderStatusBadge.textContent = config.text;
                orderStatusBadge.className = `px-3 py-1 text-sm font-semibold rounded-full bg-${config.color}-500/20 text-${config.color}-300`;
            }
        }
    });

    socket.on("order:item_update", (data) => {
        if (data.id !== orderId) return;

        if (completedCountEl) completedCountEl.textContent = data.completedItems;
        if (failedCountEl) failedCountEl.textContent = data.failedItems;
        if (pendingCountEl) {
            pendingCountEl.textContent = data.totalItems - data.completedItems - data.failedItems;
        }

        if (data.item) {
            const itemRow = document.getElementById(`item-row-${data.item._id}`);
            if (itemRow) {
                itemRow.dataset.status = data.item.status;
                const statusDisplay = itemRow.querySelector(".item-status-display");
                let itemStatus = { text: "Queued", color: "gray", icon: "ri-time-line" };
                if (data.item.status === "processing") itemStatus = { text: "Processing", color: "blue", icon: "ri-loader-4-line animate-spin" };
                if (data.item.status === "completed") itemStatus = { text: "Completed", color: "green", icon: "ri-check-line" };
                if (data.item.status === "failed") itemStatus = { text: "Failed", color: "red", icon: "ri-close-line" };
                statusDisplay.className = `item-status-display flex items-center flex-shrink-0 gap-2 text-xs font-semibold text-${itemStatus.color}-400`;
                statusDisplay.innerHTML = `<i class="${itemStatus.icon}"></i><span>${itemStatus.text}</span>`;
                applyFilter();
            }
        }
    });
});