document.addEventListener('DOMContentLoaded', () => {
    // Period Filter Logic
    const periodFilter = document.getElementById('period-filter');
    periodFilter.addEventListener('change', (e) => {
        const selectedPeriod = e.target.value;
        const url = new URL(window.location);
        url.searchParams.set('period', selectedPeriod);
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

        const orderGradient = chartCtx.createLinearGradient(0, 0, 0, canvas.height);
        orderGradient.addColorStop(0, 'rgba(59, 130, 246, 0.8)');
        orderGradient.addColorStop(1, 'rgba(59, 130, 246, 0.4)');

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
                        pointRadius: 4,
                        pointHoverRadius: 7,
                        pointBorderWidth: 2,
                    },
                    {
                        label: 'Đơn hàng',
                        data: chartData.orders,
                        backgroundColor: orderGradient,
                        borderColor: 'rgba(59, 130, 246, 1)',
                        borderWidth: 0,
                        yAxisID: 'yOrders',
                        borderRadius: 6,
                        borderSkipped: false,
                        barPercentage: 0.6,
                        categoryPercentage: 0.7,
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
                            unit: chartData.timeUnit,
                            tooltipFormat: 'dd/MM/yyyy',
                            displayFormats: { day: 'dd/MM', week: 'dd/MM', month: 'MM/yyyy', year: 'yyyy', }
                        },
                        grid: { color: 'rgba(255, 255, 255, 0.1)', borderDash: [5, 5] },
                        ticks: { color: '#9ca3af' }
                    },
                    yRevenue: {
                        type: 'linear', position: 'left', beginAtZero: true,
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                        ticks: { color: '#a7f3d0', callback: (v) => v >= 1e6 ? `${v/1e6}tr` : (v >= 1e3 ? `${v/1e3}k` : v) }
                    },
                    yOrders: {
                        type: 'linear', position: 'right', beginAtZero: true,
                        grid: { drawOnChartArea: false },
                        ticks: { color: '#93c5fd', precision: 0 }
                    }
                },
                plugins: {
                    legend: { labels: { color: '#d1d5db', usePointStyle: true, boxWidth: 8 } },
                    tooltip: {
                        enabled: true,
                        backgroundColor: 'rgba(17, 24, 39, 0.85)', titleColor: '#ffffff', bodyColor: '#d1d5db',
                        borderColor: 'rgba(255, 255, 255, 0.1)', borderWidth: 1, padding: 12, cornerRadius: 8,
                        usePointStyle: true, boxPadding: 4,
                        callbacks: {
                            label: (c) => `${c.dataset.label}: ${c.dataset.yAxisID==='yRevenue' ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(c.parsed.y) : c.parsed.y}`
                        }
                    }
                }
            }
        });
    }
});