document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('order-detail-container');
    if (!container) return; // Exit if the container is not on the page

    const orderId = container.dataset.orderId;

    // --- DOM ELEMENTS ---
    const elements = {
        completedCount: document.getElementById("completed-count"),
        failedCount: document.getElementById("failed-count"),
        pendingCount: document.getElementById("pending-count"),
        orderStatusBadge: document.getElementById("order-status-badge"),
        filterContainer: document.getElementById("item-filters"),
        itemRows: Array.from(document.querySelectorAll(".item-row")),
        searchInput: document.getElementById("item-search-input"),
        selectAllCheckbox: document.getElementById("selectAllCheckbox"),
        itemCheckboxes: Array.from(document.querySelectorAll(".item-checkbox")),
        selectionCountContainer: document.getElementById("selection-count"),
        selectedItemsCount: document.getElementById("selected-items-count"),
        copyOrderIdBtn: document.getElementById("copy-order-id-btn"),
        orderIdText: document.getElementById("order-id-text"),
        itemListContainer: document.getElementById('item-list-container'),
        contextMenu: document.getElementById('custom-context-menu'),
        contextCopyBtn: document.getElementById('context-copy-btn')
    };

    let lastCheckedCheckbox = null;

    // --- FUNCTIONS ---

    /**
     * Updates the UI state based on current selections (checkboxes, context menu, counts).
     */
    function updateSelectionState() {
        const visibleCheckboxes = elements.itemCheckboxes.filter(cb => cb.closest('.item-row').style.display !== 'none');
        const checkedVisibleCheckboxes = visibleCheckboxes.filter(cb => cb.checked);
        const anyChecked = checkedVisibleCheckboxes.length > 0;
        const allVisibleChecked = visibleCheckboxes.length > 0 && checkedVisibleCheckboxes.length === visibleCheckboxes.length;

        if (elements.selectionCountContainer) {
            elements.selectionCountContainer.classList.toggle('hidden', !anyChecked);
            if (anyChecked) {
                elements.selectedItemsCount.textContent = checkedVisibleCheckboxes.length;
            }
        }

        if (elements.selectAllCheckbox) {
            elements.selectAllCheckbox.checked = allVisibleChecked;
            elements.selectAllCheckbox.indeterminate = anyChecked && !allVisibleChecked;
        }
    }

    /**
     * Applies filters (status and search) to the item list.
     */
    function applyFilter() {
        const activeFilter = elements.filterContainer.querySelector(".filter-btn.active")?.dataset.filter || "all";
        const searchTerm = elements.searchInput.value.toLowerCase();

        elements.itemRows.forEach((row) => {
            const status = row.dataset.status;
            const itemData = row.querySelector(".font-mono").textContent.toLowerCase();
            let statusMatch = activeFilter === "all" ||
                              (activeFilter === "pending" && (status === "queued" || status === "processing")) ||
                              status === activeFilter;
            const searchMatch = itemData.includes(searchTerm);
            row.style.display = statusMatch && searchMatch ? "flex" : "none";
        });
        updateSelectionState();
    }

    /**
     * Copies the text content of selected items to the clipboard.
     */
    function copySelectedItems() {
        const selectedItems = elements.itemCheckboxes
            .filter(cb => cb.checked)
            .map(cb => cb.value);

        if (selectedItems.length === 0) {
            return showToast('Vui lòng chọn ít nhất một item.', 'Thông báo', 'info');
        }

        const textToCopy = selectedItems.join('\n');
        navigator.clipboard.writeText(textToCopy).then(() => {
            showToast(`Đã sao chép ${selectedItems.length} item.`, 'Thành công', 'success');
        }).catch(() => {
            showToast('Sao chép thất bại!', 'Lỗi', 'error');
        });
    }

    // --- EVENT LISTENERS ---

    // Filter button clicks
    if (elements.filterContainer) {
        elements.filterContainer.querySelectorAll(".filter-btn").forEach(button => {
            button.addEventListener("click", () => {
                // *** BỎ CHỌN TẤT CẢ KHI LỌC ***
                elements.itemCheckboxes.forEach(cb => cb.checked = false);
                lastCheckedCheckbox = null; // Reset lại logic shift-click
                // **********************************

                elements.filterContainer.querySelector(".filter-btn.active")?.classList.remove("active", "border-blue-500/80", "text-white", "shadow-md", "shadow-blue-500/10", "bg-blue-500/10");
                button.classList.add("active", "border-blue-500/80", "text-white", "shadow-md", "shadow-blue-500/10", "bg-blue-500/10");
                applyFilter();
            });
        });
    }

    // Search input
    if (elements.searchInput) {
        elements.searchInput.addEventListener("input", applyFilter);
    }

    // Select All Checkbox
    if (elements.selectAllCheckbox) {
        elements.selectAllCheckbox.addEventListener('change', (e) => {
            elements.itemCheckboxes.forEach(cb => {
                if (cb.closest('.item-row').style.display !== 'none') {
                    cb.checked = e.target.checked;
                }
            });
            updateSelectionState();
        });
    }

    // Individual Item Checkboxes (with Shift-click)
    elements.itemCheckboxes.forEach((checkbox, index) => {
        checkbox.addEventListener('click', (e) => {
            if (e.shiftKey && lastCheckedCheckbox) {
                const lastIndex = elements.itemCheckboxes.indexOf(lastCheckedCheckbox);
                const currentIndex = index;
                const [start, end] = [lastIndex, currentIndex].sort((a, b) => a - b);
                
                elements.itemCheckboxes.slice(start, end + 1).forEach(cb => {
                    if (cb.closest('.item-row').style.display !== 'none') {
                        cb.checked = true;
                    }
                });
            }
            lastCheckedCheckbox = checkbox;
            updateSelectionState();
        });
    });

    // Custom Context Menu
    if (elements.itemListContainer && elements.contextMenu) {
        elements.itemListContainer.addEventListener('contextmenu', (e) => {
            const anyChecked = elements.itemCheckboxes.some(cb => cb.checked);
            if (anyChecked) {
                e.preventDefault();
                elements.contextMenu.style.top = `${e.clientY}px`;
                elements.contextMenu.style.left = `${e.clientX}px`;
                elements.contextMenu.classList.remove('hidden');
            }
        });

        document.addEventListener('click', () => {
            elements.contextMenu.classList.add('hidden');
        });

        elements.contextCopyBtn.addEventListener('click', () => {
            copySelectedItems();
            elements.contextMenu.classList.add('hidden');
        });
    }

    // Copy Order ID
    if (elements.copyOrderIdBtn) {
        elements.copyOrderIdBtn.addEventListener("click", () => {
            navigator.clipboard.writeText(elements.orderIdText.textContent.trim()).then(() => {
                showToast("Đã sao chép ID đơn hàng!");
                const icon = elements.copyOrderIdBtn.querySelector("i");
                icon.className = "ri-check-line";
                setTimeout(() => { icon.className = "ri-file-copy-line"; }, 2000);
            }).catch(() => showToast("Sao chép thất bại!", "error"));
        });
    }

    // --- SOCKET.IO ---
    const socket = io();
    socket.on("connect", () => {
        socket.emit('join_room', `order_${orderId}`);
    });

    socket.on("order:update", (data) => {
        if (data.id !== orderId) return;
        if (data.status === 'completed' || data.status === 'failed') {
            showToast('Đơn hàng của bạn đã hoàn tất! Tự động làm mới...', 'Thành công', 'success');
            setTimeout(() => window.location.reload(), 2000);
        } else if (elements.orderStatusBadge) {
            let config = data.status === "processing" ? { text: "Processing", color: "yellow" } : { text: "Pending", color: "gray" };
            elements.orderStatusBadge.textContent = config.text;
            elements.orderStatusBadge.className = `px-3 py-1 text-sm font-semibold rounded-full bg-${config.color}-500/20 text-${config.color}-300`;
        }
    });

    socket.on("order:item_update", (data) => {
        if (data.id !== orderId) return;

        if (elements.completedCount) elements.completedCount.textContent = data.completedItems;
        if (elements.failedCount) elements.failedCount.textContent = data.failedItems;
        if (elements.pendingCount) {
            elements.pendingCount.textContent = data.totalItems - data.completedItems - data.failedItems;
        }

        if (data.item) {
            const itemRow = document.getElementById(`item-row-${data.item._id}`);
            if (itemRow) {
                itemRow.dataset.status = data.item.status;
                const statusDisplay = itemRow.querySelector(".item-status-display");
                const statusMap = {
                    processing: { text: "Processing", color: "blue", icon: "ri-loader-4-line animate-spin" },
                    completed: { text: "Completed", color: "green", icon: "ri-check-line" },
                    failed: { text: "Failed", color: "red", icon: "ri-close-line" },
                    queued: { text: "Queued", color: "gray", icon: "ri-time-line" }
                };
                const itemStatus = statusMap[data.item.status] || statusMap.queued;
                statusDisplay.className = `item-status-display flex items-center flex-shrink-0 gap-2 text-xs font-semibold text-${itemStatus.color}-400`;
                statusDisplay.innerHTML = `<i class="${itemStatus.icon}"></i><span>${itemStatus.text}</span>`;
                applyFilter();
            }
        }
    });

    // --- INITIAL STATE ---
    updateSelectionState();
});