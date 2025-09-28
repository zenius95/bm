document.addEventListener('DOMContentLoaded', () => {
    // Bộ lọc cho các thẻ thống kê
    const periodFilter = document.getElementById('period-filter');
    periodFilter.addEventListener('change', (e) => {
        const selectedPeriod = e.target.value;
        const url = new URL(window.location);
        url.searchParams.set('period', selectedPeriod);
        // Xóa bộ lọc của chart khi thay đổi bộ lọc chính
        url.searchParams.delete('chart_month');
        url.searchParams.delete('chart_year');
        window.location.href = url.toString();
    });

    // Bộ lọc cho biểu đồ
    const chartFilterForm = document.getElementById('chart-filter-form');
    chartFilterForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const month = document.getElementById('chart-month-select').value;
        const year = document.getElementById('chart-year-select').value;
        const currentPeriod = periodFilter.value;
        
        const url = new URL(window.location);
        url.searchParams.set('period', currentPeriod); // Giữ lại bộ lọc của thẻ
        url.searchParams.set('chart_month', month);
        url.searchParams.set('chart_year', year);
        window.location.href = url.toString();
    });


    // Chart.js Logic
    const ctx = document.getElementById('revenueChart');
    if (ctx) {
        const chartData = JSON.parse(document.getElementById('chartData').textContent || '{}');
        const canvas = document.getElementById('revenueChart');
        const chartCtx = canvas.getContext('2d');

        const revenueGradient = chartCtx.createLinearGradient(0, 0, 0, canvas.height);
        revenueGradient.addColorStop(0, 'rgba(34, 197, 94, 0.6)');
        revenueGradient.addColorStop(1, 'rgba(34, 197, 94, 0)');

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: chartData.labels,
                datasets: [
                    {
                        label: 'Doanh số (VND)',
                        data: chartData.revenues,
                        backgroundColor: revenueGradient,
                        borderColor: 'rgba(34, 197, 94, 1)',
                        borderWidth: 2,
                        yAxisID: 'yRevenue',
                        type: 'line',
                        tension: 0.4,
                        fill: true,
                        pointBackgroundColor: 'rgba(34, 197, 94, 1)',
                        pointBorderColor: '#111827',
                        pointHoverBackgroundColor: '#fff',
                        pointHoverBorderColor: 'rgba(34, 197, 94, 1)',
                        pointRadius: 2,
                        pointHoverRadius: 5,
                        pointBorderWidth: 2,
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'day',
                            tooltipFormat: 'dd/MM/yyyy',
                            displayFormats: { day: 'dd/MM' }
                        },
                        grid: { color: 'rgba(255, 255, 255, 0.1)', borderDash: [5, 5] },
                        ticks: { color: '#9ca3af' }
                    },
                    yRevenue: {
                        type: 'linear', position: 'left', beginAtZero: true,
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                        ticks: { color: '#a7f3d0', callback: (v) => v >= 1e6 ? `${v/1e6}tr` : (v >= 1e3 ? `${v/1e3}k` : v) }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        enabled: true,
                        backgroundColor: 'rgba(17, 24, 39, 0.85)', titleColor: '#ffffff', bodyColor: '#d1d5db',
                        borderColor: 'rgba(255, 255, 255, 0.1)', borderWidth: 1, padding: 12, cornerRadius: 8,
                        usePointStyle: true, boxPadding: 4,
                        callbacks: {
                            label: (c) => `Doanh số: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(c.parsed.y)}`
                        }
                    }
                }
            }
        });
    }

    const viewDetailsBtn = document.getElementById('view-chart-details-btn');
    const detailsModal = document.getElementById('chart-details-modal');
    const modalBackdrop = document.getElementById('custom-modal-backdrop'); 
    const detailsTbody = document.getElementById('chart-details-tbody');
    const modalDateRange = document.getElementById('modal-date-range');
    const monthSelect = document.getElementById('chart-month-select');
    const yearSelect = document.getElementById('chart-year-select');
    const searchInput = document.getElementById('revenue-search-input');
    const exportCsvBtn = document.getElementById('export-csv-btn');
    const exportXlsxBtn = document.getElementById('export-xlsx-btn');

    let allTransactions = []; 

    const showDetailsModal = () => {
        if (!detailsModal || !modalBackdrop) return;
        modalBackdrop.classList.remove('hidden');
        detailsModal.classList.remove('hidden');
        setTimeout(() => {
            modalBackdrop.classList.remove('opacity-0');
            detailsModal.classList.remove('opacity-0', 'scale-95');
        }, 10);
    };

    const hideDetailsModal = () => {
        if (!detailsModal || !modalBackdrop) return;
        modalBackdrop.classList.add('opacity-0');
        detailsModal.classList.add('opacity-0', 'scale-95');
        setTimeout(() => {
            modalBackdrop.classList.add('hidden');
            detailsModal.classList.add('hidden');
        }, 300);
    };

    const renderTable = (transactions) => {
        if (transactions.length > 0) {
            detailsTbody.innerHTML = transactions.map(log => {
                const change = log.metadata.change || 0;
                const changeClass = change >= 0 ? 'text-green-400' : 'text-red-400';
                const changeFormatted = (change >= 0 ? '+' : '') + change.toLocaleString('vi-VN') + 'đ';
                let actionText = log.action;
                if (log.action === 'CLIENT_DEPOSIT') actionText = 'Nạp tiền thủ công';
                if (log.action === 'CLIENT_DEPOSIT_AUTO') actionText = 'Nạp tiền tự động';
                if (log.action === 'ADMIN_ADJUST_BALANCE') actionText = 'Admin điều chỉnh';
                return `
                    <tr class="hover:bg-white/5">
                        <td class="px-6 py-3 text-gray-400">${new Date(log.createdAt).toLocaleString('vi-VN')}</td>
                        <td class="px-6 py-3 font-semibold">${log.user ? log.user.username : 'N/A'}</td>
                        <td class="px-6 py-3">${actionText}</td>
                        <td class="px-6 py-3 text-right font-mono ${changeClass}">${changeFormatted}</td>
                    </tr>
                `;
            }).join('');
        } else {
            detailsTbody.innerHTML = '<tr><td colspan="4" class="text-center p-8 text-gray-400">Không có giao dịch nào khớp với tìm kiếm.</td></tr>';
        }
    };

    if (viewDetailsBtn) {
        viewDetailsBtn.addEventListener('click', async () => {
            const month = monthSelect.value;
            const year = yearSelect.value;
            const monthName = monthSelect.options[monthSelect.selectedIndex].text;
            modalDateRange.textContent = `Dữ liệu cho ${monthName}, ${year}`;
            detailsTbody.innerHTML = '<tr><td colspan="4" class="text-center p-8 text-gray-400">Đang tải dữ liệu...</td></tr>';
            showDetailsModal();
            try {
                const response = await fetch(`/admin/dashboard/revenue-details?chart_month=${month}&chart_year=${year}`);
                const result = await response.json();
                if (result.success && result.transactions) {
                    allTransactions = result.transactions;
                    renderTable(allTransactions);
                } else {
                    detailsTbody.innerHTML = `<tr><td colspan="4" class="text-center p-8 text-red-400">Lỗi: ${result.message}</td></tr>`;
                }
            } catch (error) {
                detailsTbody.innerHTML = `<tr><td colspan="4" class="text-center p-8 text-red-400">Lỗi kết nối: ${error.message}</td></tr>`;
            }
        });
    }

    if(searchInput) {
        searchInput.addEventListener('input', () => {
            const searchTerm = searchInput.value.toLowerCase();
            const filteredTransactions = allTransactions.filter(log => {
                const username = log.user ? log.user.username.toLowerCase() : '';
                const details = log.details.toLowerCase();
                return username.includes(searchTerm) || details.includes(searchTerm);
            });
            renderTable(filteredTransactions);
        });
    }

    const exportData = (format) => {
        const month = monthSelect.value;
        const year = yearSelect.value;
        const search = searchInput.value;
        const url = `/admin/dashboard/export-revenue?format=${format}&chart_month=${month}&chart_year=${year}&search=${encodeURIComponent(search)}`;
        window.location.href = url;
    };

    if(exportCsvBtn) {
        exportCsvBtn.addEventListener('click', () => exportData('csv'));
    }

    if(exportXlsxBtn) {
        exportXlsxBtn.addEventListener('click', () => exportData('xlsx'));
    }

    if (detailsModal) {
        detailsModal.querySelector('.btn-cancel').addEventListener('click', hideDetailsModal);
    }
    
    if(modalBackdrop) {
        modalBackdrop.addEventListener('click', () => {
            if (detailsModal && !detailsModal.classList.contains('hidden')) {
                hideDetailsModal();
            }
        });
    }
});