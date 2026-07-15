let doughnutChart = null;
let dailyTrendChart = null;

function getKeyWithMaxValue(obj) {
    if (!obj || Object.keys(obj).length === 0) return "N/A";
    return Object.keys(obj).reduce((a, b) => obj[a] > obj[b] ? a : b);
}

async function initReports() {
    console.log('[Reports] initReports started', { chartJsDefined: typeof Chart !== 'undefined' });

    const data = await fetchReportingData();
    console.log('[Reports] fetchReportingData returned:', JSON.parse(JSON.stringify(data)));

    const totalViolationsCount = data.types.counts.reduce((a, b) => a + b, 0);
    const typeMap = {};
    data.types.labels.forEach((l, idx) => typeMap[l] = data.types.counts[idx]);

    const totalEvents = data.trends.compliant.reduce((a,b)=>a+b,0) + data.trends.violations.reduce((a,b)=>a+b,0) + data.trends.falls.reduce((a,b)=>a+b,0);

    document.getElementById("rep-total-violations").textContent = totalViolationsCount;
    document.getElementById("rep-top-type").textContent = getKeyWithMaxValue(typeMap);
    document.getElementById("rep-total-events").textContent = totalEvents;

    if (typeof Chart === 'undefined') {
        document.querySelectorAll('.chart-container').forEach(el => {
            el.style.display = 'flex';
            el.style.alignItems = 'center';
            el.style.justifyContent = 'center';
            el.textContent = 'Chart library failed to load';
        });
        return;
    }

    setTimeout(() => {
        try {
            renderCharts(data);
        } catch (e) {
            console.error('[Reports] renderCharts error:', e);
        }
    }, 100);
}

function renderCharts(data) {
    console.log('[Reports] renderCharts called');

    const ctxDist = document.getElementById("typeDistributionChart");
    console.log('[Reports] typeDistributionChart element:', ctxDist);
    if (ctxDist) {
        if (doughnutChart) doughnutChart.destroy();
        doughnutChart = new Chart(ctxDist, {
            type: 'doughnut',
            data: {
                labels: data.types.labels.length ? data.types.labels : ['No Data'],
                datasets: [{
                    data: data.types.counts.length ? data.types.counts : [1],
                    backgroundColor: ['rgba(239, 68, 68, 0.85)', 'rgba(245, 158, 11, 0.85)', 'rgba(139, 92, 246, 0.85)', 'rgba(236, 72, 153, 0.85)', 'rgba(6, 182, 212, 0.85)'],
                    borderColor: '#1f2a3f',
                    borderWidth: 2,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right', labels: { color: '#e5e7eb', font: { family: "'Outfit', sans-serif", size: 12 } } }
                }
            }
        });
        console.log('[Reports] doughnutChart created');
    }

    const ctxDaily = document.getElementById("dailyTrendChart");
    console.log('[Reports] dailyTrendChart element:', ctxDaily);
    if (ctxDaily) {
        if (dailyTrendChart) dailyTrendChart.destroy();
        dailyTrendChart = new Chart(ctxDaily, {
            type: 'line',
            data: {
                labels: data.trends.labels,
                datasets: [
                    { label: 'Compliant', data: data.trends.compliant, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.2)', borderWidth: 2, tension: 0.4, fill: true, pointRadius: 4, pointBackgroundColor: '#10b981' },
                    { label: 'Violations', data: data.trends.violations, borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.2)', borderWidth: 2, tension: 0.4, fill: true, pointRadius: 4, pointBackgroundColor: '#ef4444' }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#e5e7eb', font: { family: "'Outfit', sans-serif", size: 12 } } }
                },
                scales: {
                    x: { grid: { color: 'rgba(46, 59, 78, 0.3)' }, ticks: { color: '#9ca3af', font: { family: "'Outfit', sans-serif" } } },
                    y: { beginAtZero: true, grid: { color: 'rgba(46, 59, 78, 0.3)' }, ticks: { color: '#9ca3af', font: { family: "'Outfit', sans-serif" }, precision: 0 } }
                }
            }
        });
        console.log('[Reports] dailyTrendChart created');
    }
    console.log('[Reports] renderCharts finished');
}

document.getElementById("export-pdf-btn")?.addEventListener("click", () => window.print());

document.getElementById("export-data-btn")?.addEventListener("click", async () => {
    const data = await fetchReportingData();
    const rows = [["Metric / Category", "Item Name", "Alert Count"]];
    data.types.labels.forEach((l, idx) => rows.push(["Violation Type", `"${l}"`, data.types.counts[idx]]));
    data.trends.labels.forEach((l, idx) => {
        rows.push(["Daily Trend - " + l, "Compliant", data.trends.compliant[idx]]);
        rows.push(["Daily Trend - " + l, "Violations", data.trends.violations[idx]]);
        rows.push(["Daily Trend - " + l, "Falls", data.trends.falls[idx]]);
    });
    const csvContent = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ppe_compliance_aggregations.csv";
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
});

document.addEventListener("DOMContentLoaded", initReports);
