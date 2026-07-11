// PPE Compliance Detection System - Reports Page Logic

let lineChart = null;
let doughnutChart = null;
let barChart = null;

// Helpers to extract max value from objects
function getKeyWithMaxValue(obj) {
    if (!obj || Object.keys(obj).length === 0) return "N/A";
    return Object.keys(obj).reduce((a, b) => obj[a] > obj[b] ? a : b);
}

async function initReports() {
    const data = await fetchReportingData();
    
    // 1. Calculate Aggregations
    const totalViolationsCount = data.types.counts.reduce((a, b) => a + b, 0);
    
    // Build maps for metrics calculation
    const typeMap = {};
    data.types.labels.forEach((l, idx) => typeMap[l] = data.types.counts[idx]);
    const siteMap = {};
    data.sites.labels.forEach((l, idx) => siteMap[l] = data.sites.counts[idx]);

    // 2. Populate Metrics Cards
    document.getElementById("rep-total-violations").textContent = totalViolationsCount;
    document.getElementById("rep-top-type").textContent = getKeyWithMaxValue(typeMap);
    document.getElementById("rep-top-site").textContent = getKeyWithMaxValue(siteMap);

    // 3. Render Chart 1: Line Chart (Trends over Time)
    const ctxTrend = document.getElementById("typeTrendsChart");
    if (ctxTrend) {
        if (lineChart) lineChart.destroy();
        lineChart = new Chart(ctxTrend, {
            type: 'line',
            data: {
                labels: data.trends.labels,
                datasets: [
                    {
                        label: 'Helmet Alerts',
                        data: data.trends.helmet,
                        borderColor: '#f59e0b',
                        backgroundColor: 'rgba(245, 158, 11, 0.1)',
                        borderWidth: 2,
                        tension: 0.35,
                        fill: true
                    },
                    {
                        label: 'Vest Alerts',
                        data: data.trends.vest,
                        borderColor: '#ef4444',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        borderWidth: 2,
                        tension: 0.35,
                        fill: true
                    },
                    {
                        label: 'Gloves Alerts',
                        data: data.trends.gloves,
                        borderColor: '#60a5fa',
                        backgroundColor: 'rgba(96, 165, 250, 0.1)',
                        borderWidth: 2,
                        tension: 0.35,
                        fill: true
                    }
                ]
            },
            options: getChartOptions()
        });
    }

    // 4. Render Chart 2: Doughnut Chart (Violations by Site)
    const ctxSite = document.getElementById("siteViolationsChart");
    if (ctxSite) {
        if (doughnutChart) doughnutChart.destroy();
        doughnutChart = new Chart(ctxSite, {
            type: 'doughnut',
            data: {
                labels: data.sites.labels,
                datasets: [{
                    data: data.sites.counts,
                    backgroundColor: [
                        'rgba(59, 130, 246, 0.75)', // primary blue
                        'rgba(245, 158, 11, 0.75)', // warning gold
                        'rgba(139, 92, 246, 0.75)', // violet
                        'rgba(236, 72, 153, 0.75)'  // pink
                    ],
                    borderColor: '#1f2a3f',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            color: '#9ca3af',
                            font: { family: "'Outfit', sans-serif" }
                        }
                    }
                }
            }
        });
    }

    // 5. Render Chart 3: Horizontal Bar Chart (Violations by Camera)
    const ctxCamera = document.getElementById("cameraViolationsChart");
    if (ctxCamera) {
        if (barChart) barChart.destroy();
        barChart = new Chart(ctxCamera, {
            type: 'bar',
            data: {
                labels: data.cameras.labels,
                datasets: [{
                    label: 'Alert Counts',
                    data: data.cameras.counts,
                    backgroundColor: 'rgba(239, 68, 68, 0.75)',
                    borderColor: '#ef4444',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(46, 59, 78, 0.3)' },
                        ticks: { color: '#9ca3af', font: { family: "'Outfit', sans-serif" }, precision: 0 }
                    },
                    y: {
                        grid: { display: false },
                        ticks: { color: '#9ca3af', font: { family: "'Outfit', sans-serif" } }
                    }
                }
            }
        });
    }
}

// Chart.js Shared Layout Configurations
function getChartOptions() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                labels: {
                    color: '#9ca3af',
                    font: { family: "'Outfit', sans-serif" }
                }
            }
        },
        scales: {
            x: {
                grid: { color: 'rgba(46, 59, 78, 0.3)' },
                ticks: { color: '#9ca3af', font: { family: "'Outfit', sans-serif" } }
            },
            y: {
                grid: { color: 'rgba(46, 59, 78, 0.3)' },
                ticks: { color: '#9ca3af', font: { family: "'Outfit', sans-serif" }, precision: 0 }
            }
        }
    };
}

// Print Handler
document.getElementById("export-pdf-btn").addEventListener("click", () => {
    window.print();
});

// CSV Raw chart exporter
document.getElementById("export-data-btn").addEventListener("click", async () => {
    const data = await fetchReportingData();
    const rows = [["Metric / Category", "Item Name", "Alert Count"]];

    // Append Type Aggregations
    data.types.labels.forEach((l, idx) => {
        rows.push(["Violation Type", `"${l}"`, data.types.counts[idx]]);
    });

    // Append Site Aggregations
    data.sites.labels.forEach((l, idx) => {
        rows.push(["Location Site", `"${l}"`, data.sites.counts[idx]]);
    });

    // Append Camera Aggregations
    data.cameras.labels.forEach((l, idx) => {
        rows.push(["Camera Feed", `"${l}"`, data.cameras.counts[idx]]);
    });

    const csvContent = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `ppe_compliance_aggregations.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

// Run
document.addEventListener("DOMContentLoaded", initReports);
