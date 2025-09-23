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
                    legend: { display: false }, // Ẩn legend vì chỉ có 1 loại dữ liệu
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
});