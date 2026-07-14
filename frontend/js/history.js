// PPE Compliance Detection System - History Page Logic

// Local State
let historyCurrentPage = 1;
const historyLimit = 20;
let historySortBy = "detected_at";
let historySortOrder = "desc";
let historyDebounceTimer = null;
let historyCamerasMap = {};

// Elements
const historyDateInput = document.getElementById("history-date");
const historyDatePrevBtn = document.getElementById("history-date-prev");
const historyDateNextBtn = document.getElementById("history-date-next");
const historyTodayBtn = document.getElementById("history-today-btn");
const loadHistoryBtn = document.getElementById("load-history-btn");
const exportCsvBtn = document.getElementById("export-history-csv");
const historyTbody = document.getElementById("history-tbody");
const paginationInfo = document.getElementById("history-pagination-info");
const paginationControls = document.getElementById("history-pagination-controls");
const tableHeaders = document.querySelectorAll("#history-table th.sortable");

// Summary elements
const histTotal = document.getElementById("hist-total");
const histViolations = document.getElementById("hist-violations");
const histFalls = document.getElementById("hist-falls");
const histCompliant = document.getElementById("hist-compliant");

// Format date timestamp
function formatFullDateTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

// Load cameras for history
async function loadCamerasForHistory() {
    try {
        const cameras = await getCameras();
        historyCamerasMap = {};
        cameras.forEach(c => {
            historyCamerasMap[c.id] = c;
        });
    } catch (e) {
        console.error("Failed to load cameras for history:", e);
    }
}

// Fetch and render history
async function loadHistory() {
    const date = historyDateInput.value;
    if (!date) return;

    historyTbody.innerHTML = `
        <tr>
            <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 3rem;">
                <div style="display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
                    <span class="spinner" style="width: 20px; height: 20px; border-width: 2px;"></span>
                    <span>Retrieving history records...</span>
                </div>
            </td>
        </tr>
    `;

    const { data: events, totalCount } = await fetchViolations({
        type: "all",
        dateStart: date,
        dateEnd: date,
        sortBy: historySortBy,
        sortOrder: historySortOrder,
        page: historyCurrentPage,
        limit: historyLimit
    });

    if (!events || events.length === 0) {
        historyTbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 4rem;">
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 0.75rem;">
                        <i data-lucide="calendar-x" style="width: 40px; height: 40px; color: var(--text-muted);"></i>
                        <span style="font-weight: 500; font-size: 1rem;">No records for this date</span>
                        <p style="font-size: 0.85rem; max-width: 300px; margin: 0 auto;">Try selecting a different date or check if cameras were active.</p>
                    </div>
                </td>
            </tr>
        `;
        paginationInfo.textContent = "Showing 0 to 0 of 0 entries";
        paginationControls.innerHTML = "";
        lucide.createIcons();
        updateSummary({ total: 0, violations: 0, falls: 0, compliant: 0 });
        document.getElementById("history-summary").style.display = "none";
        return;
    }

    historyTbody.innerHTML = "";

    events.forEach(event => {
        const tr = document.createElement("tr");
        
        // Time
        const timeCell = document.createElement("td");
        timeCell.textContent = formatFullDateTime(event.detected_at || event.created_at);
        timeCell.style.whiteSpace = "nowrap";

        // Type badge
        const typeCell = document.createElement("td");
        let badgeClass = "status-violation";
        let iconName = "alert-octagon";
        
        if (event.event_type === "compliant") {
            badgeClass = "status-compliant";
            iconName = "shield-check";
        } else if (event.event_type === "fall") {
            iconName = "user";
        } else if (event.detections && event.detections.some(d => d.class_name?.includes("Hardhat"))) {
            iconName = "hard-hat";
        }
        
        typeCell.innerHTML = `
            <span class="status-badge ${badgeClass}">
                <i data-lucide="${iconName}" style="width: 14px; height: 14px;"></i>
                ${event.event_type === "compliant" ? "Compliant" : (event.event_type === "fall" ? "Fall Detected" : "Violation")}
            </span>
        `;

        // Camera
        const camInfo = historyCamerasMap[event.camera_id];
        const cameraCell = document.createElement("td");
        cameraCell.textContent = camInfo?.name || (event.camera_id ? `CAM-${event.camera_id.substring(0,4)}` : "Live Camera");
        cameraCell.style.fontWeight = "500";

        // Zone
        const zoneCell = document.createElement("td");
        zoneCell.textContent = camInfo?.zone || "—";

        // Area
        const areaCell = document.createElement("td");
        areaCell.textContent = "Processing Floor";

        // Confidence
        const confCell = document.createElement("td");
        if (event.detections && event.detections.length > 0) {
            const avgConf = Math.round(event.detections.reduce((s, d) => s + d.confidence, 0) / event.detections.length * 100);
            confCell.textContent = `${avgConf}%`;
        } else {
            confCell.textContent = "—";
        }
        confCell.style.fontWeight = "600";

        // Status
        const statusCell = document.createElement("td");
        if (event.event_type === "compliant") {
            statusCell.innerHTML = `
                <span class="status-badge status-compliant" style="opacity: 0.7;">
                    <i data-lucide="check" style="width: 12px; height: 12px;"></i> OK
                </span>
            `;
        } else if (event.status === "Acknowledged") {
            statusCell.innerHTML = `
                <span class="status-badge status-warning">
                    <i data-lucide="eye-off" style="width: 14px; height: 14px;"></i> Acknowledged
                </span>
            `;
        } else {
            statusCell.innerHTML = `
                <span class="status-badge status-violation">
                    <i data-lucide="x-circle" style="width: 14px; height: 14px;"></i> Active
                </span>
            `;
        }

        // Actions
        const actionCell = document.createElement("td");
        if (event.event_type !== "compliant") {
            const viewBtn = document.createElement("button");
            viewBtn.className = "btn btn-outline";
            viewBtn.style.padding = "0.3rem 0.6rem";
            viewBtn.style.fontSize = "0.75rem";
            viewBtn.innerHTML = `<i data-lucide="eye" style="width: 12px; height: 12px;"></i> View`;
            viewBtn.onclick = () => openEventModal(event);
            actionCell.appendChild(viewBtn);
        } else {
            actionCell.innerHTML = `<span style="color: var(--text-dark); font-size: 0.8rem;">—</span>`;
        }

        tr.appendChild(timeCell);
        tr.appendChild(typeCell);
        tr.appendChild(cameraCell);
        tr.appendChild(zoneCell);
        tr.appendChild(areaCell);
        tr.appendChild(confCell);
        tr.appendChild(statusCell);
        tr.appendChild(actionCell);
        historyTbody.appendChild(tr);
    });

    // Update pagination labels
    const startEntry = (historyCurrentPage - 1) * historyLimit + 1;
    const endEntry = Math.min(historyCurrentPage * historyLimit, totalCount);
    paginationInfo.textContent = `Showing ${startEntry} to ${endEntry} of ${totalCount} entries`;
    renderHistoryPagination(totalCount);

    // Update summary
    const counts = events.reduce((acc, e) => {
        if (e.event_type === "compliant") acc.compliant++;
        else if (e.event_type === "violation") acc.violations++;
        else if (e.event_type === "fall") acc.falls++;
        acc.total++;
        return acc;
    }, { total: 0, violations: 0, falls: 0, compliant: 0 });
    updateSummary(counts);

    // Show summary section
    document.getElementById("history-summary").style.display = "grid";

    lucide.createIcons();
} catch (e) {
    console.error("Failed to load history:", e);
    historyTbody.innerHTML = `
        <tr>
            <td colspan="8" style="text-align: center; color: var(--color-violation); padding: 3rem;">
                Failed to load history. Please try again.
            </td>
        </tr>
    `;
}
}

function updateSummary(counts) {
    histTotal.textContent = counts.total;
    histViolations.textContent = counts.violations;
    histFalls.textContent = counts.falls;
    histCompliant.textContent = counts.compliant;
}

// Render pagination
function renderHistoryPagination(totalCount) {
    paginationControls.innerHTML = "";
    
    const totalPages = Math.ceil(totalCount / historyLimit);
    if (totalPages <= 1) return;

    // Previous Button
    const prevBtn = document.createElement("button");
    prevBtn.className = "pagination-btn";
    prevBtn.innerHTML = `<i data-lucide="chevron-left" style="width: 14px; height: 14px; display: block;"></i>`;
    prevBtn.disabled = historyCurrentPage === 1;
    prevBtn.onclick = () => {
        if (historyCurrentPage > 1) {
            historyCurrentPage--;
            loadHistory();
        }
    };
    paginationControls.appendChild(prevBtn);

    // Number Buttons
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= historyCurrentPage - 1 && i <= historyCurrentPage + 1)) {
            const pageBtn = document.createElement("button");
            pageBtn.className = `pagination-btn ${historyCurrentPage === i ? 'active' : ''}`;
            pageBtn.textContent = i;
            pageBtn.onclick = () => {
                if (historyCurrentPage !== i) {
                    historyCurrentPage = i;
                    loadHistory();
                }
            };
            paginationControls.appendChild(pageBtn);
        } else if (i === historyCurrentPage - 2 || i === historyCurrentPage + 2) {
            const dots = document.createElement("span");
            dots.textContent = "...";
            dots.style.padding = "0.25rem 0.5rem";
            dots.style.color = "var(--text-muted)";
            paginationControls.appendChild(dots);
        }
    }

    // Next Button
    const nextBtn = document.createElement("button");
    nextBtn.className = "pagination-btn";
    nextBtn.innerHTML = `<i data-lucide="chevron-right" style="width: 14px; height: 14px; display: block;"></i>`;
    nextBtn.disabled = historyCurrentPage === totalPages;
    nextBtn.onclick = () => {
        if (historyCurrentPage < totalPages) {
            historyCurrentPage++;
            loadHistory();
        }
    };
    paginationControls.appendChild(nextBtn);

    lucide.createIcons();
}

// Sort listener
tableHeaders.forEach(th => {
    th.addEventListener("click", () => {
        const column = th.getAttribute("data-column");
        
        tableHeaders.forEach(h => {
            if (h !== th) {
                h.classList.remove("sort-asc", "sort-desc");
            }
        });

        if (historySortBy === column) {
            historySortOrder = historySortOrder === "asc" ? "desc" : "asc";
            th.classList.toggle("sort-asc", historySortOrder === "asc");
            th.classList.toggle("sort-desc", historySortOrder === "desc");
        } else {
            historySortBy = column;
            historySortOrder = "desc";
            th.classList.add("sort-desc");
            th.classList.remove("sort-asc");
        }

        historyCurrentPage = 1;
        loadHistory();
    });
});

// Export CSV
exportCsvBtn.addEventListener("click", async () => {
    const date = historyDateInput.value;
    if (!date) return;

    exportCsvBtn.disabled = true;
    const originalText = exportCsvBtn.innerHTML;
    exportCsvBtn.innerHTML = `<span class="spinner" style="width: 14px; height: 14px; border-width: 2px; margin-right: 0.5rem; display: inline-block; vertical-align: middle;"></span> Exporting...`;

    try {
        const { data: allEvents } = await fetchViolations({
            type: "all",
            dateStart: date,
            dateEnd: date,
            sortBy: historySortBy,
            sortOrder: historySortOrder,
            page: 1,
            limit: 1000
        });

        if (!allEvents || allEvents.length === 0) {
            alert("No records found to export.");
            return;
        }

        const csvHeaders = ["Event ID", "Timestamp", "Event Type", "Camera", "Zone", "Area", "Confidence", "Status"];
        const csvRows = [csvHeaders.join(",")];

        allEvents.forEach(row => {
            const camInfo = historyCamerasMap[row.camera_id];
            const formattedDate = new Date(row.detected_at || row.created_at).toISOString();
            const eventType = row.event_type === "compliant" ? "Compliant" : (row.event_type === "fall" ? "Fall Detected" : "Violation");
            const camera = camInfo?.name || (row.camera_id ? `CAM-${row.camera_id.substring(0,4)}` : "Manual");
            const zone = camInfo?.zone || "—";
            const area = "Processing Floor";
            const confidence = row.detections && row.detections.length > 0 
                ? Math.round(row.detections.reduce((s, d) => s + d.confidence, 0) / row.detections.length * 100) + "%"
                : "—";

            const escapedType = `"${eventType.replace(/"/g, '""')}"`;
            const escapedCamera = `"${camera.replace(/"/g, '""')}"`;
            const escapedZone = `"${zone.replace(/"/g, '""')}"`;
            const escapedArea = `"${area.replace(/"/g, '""')}"`;

            csvRows.push([
                row.id,
                formattedDate,
                escapedType,
                escapedCamera,
                escapedZone,
                escapedArea,
                confidence,
                eventType === "compliant" ? "Compliant" : "Unresolved"
            ].join(","));
        });

        const csvContent = csvRows.join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `ppe_history_${date}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (e) {
        console.error("Export failed:", e);
        alert("Export failed: " + e.message);
    } finally {
        exportCsvBtn.disabled = false;
        exportCsvBtn.innerHTML = originalText;
    }
});

// Image modal
function openImageModal(base64) {
    const modal = document.createElement("div");
    modal.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);display:flex;align-items:center;justify-content:center;z-index:10000;cursor:zoom-out;";
    modal.innerHTML = `<img src="data:image/jpeg;base64,${base64}" style="max-width:90%;max-height:90%;object-fit:contain;">`;
    modal.onclick = () => modal.remove();
    document.body.appendChild(modal);
}

// Event modal
function openEventModal(event) {
    const modal = document.createElement("div");
    modal.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:10000;";
    const camInfo = historyCamerasMap[event.camera_id];
    modal.innerHTML = `
        <div style="background:var(--bg-card);border-radius:12px;padding:2rem;max-width:600px;width:90%;max-height:90vh;overflow:auto;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
                <h3 style="margin:0;">Event Details</h3>
                <button onclick="this.closest('div[style*=\"position:fixed\"]').remove()" style="background:none;border:none;color:var(--text-muted);font-size:1.5rem;cursor:pointer;">&times;</button>
            </div>
            ${event.snapshot ? `<img src="data:image/jpeg;base64,${event.snapshot}" style="width:100%;border-radius:8px;margin-bottom:1rem;">` : ""}
            <div style="display:grid;gap:0.5rem;font-size:0.9rem;">
                <div><strong>Event ID:</strong> ${event.id}</div>
                <div><strong>Time:</strong> ${formatFullDateTime(event.detected_at || event.created_at)}</div>
                <div><strong>Type:</strong> <span class="status-badge ${event.event_type === 'compliant' ? 'status-compliant' : 'status-violation'}">${event.event_type === 'compliant' ? 'Compliant' : (event.event_type === 'fall' ? 'Fall Detected' : 'Violation')}</span></div>
                <div><strong>Camera:</strong> ${camInfo?.name || 'Live Camera'}</div>
                <div><strong>Zone:</strong> ${camInfo?.zone || '—'}</div>
                <div><strong>Area:</strong> Processing Floor</div>
                <div><strong>Confidence:</strong> ${event.detections && event.detections.length > 0 ? Math.round(event.detections.reduce((s,d)=>s+d.confidence,0)/event.detections.length*100)+'%' : '—'}</div>
            </div>
        </div>
    `;
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    document.body.appendChild(modal);
}

// Load on DOM ready
document.addEventListener("DOMContentLoaded", async () => {
    lucide.createIcons();
    await loadCamerasForHistory();
    
    // Set default date to today
    const today = new Date().toISOString().split('T')[0];
    historyDateInput.value = today;
    
    loadHistoryBtn.onclick = () => {
        historyCurrentPage = 1;
        loadHistory();
    };
    
    // Auto-load today's history on page load
    loadHistory();
});
