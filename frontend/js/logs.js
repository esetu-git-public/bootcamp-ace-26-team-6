// PPE Compliance Detection System - Upgraded Violations Log Page Logic

// Local State
let currentPage = 1;
const limit = 10;
let sortBy = "created_at";
let sortOrder = "desc";
let debounceTimer = null;

// Elements
const searchInput = document.getElementById("search-input");
const filterType = document.getElementById("filter-type");
const filterSite = document.getElementById("filter-site");
const filterCamera = document.getElementById("filter-camera");
const filterDateStart = document.getElementById("filter-date-start");
const filterDateEnd = document.getElementById("filter-date-end");
const clearFiltersBtn = document.getElementById("clear-filters-btn");
const exportCsvBtn = document.getElementById("export-csv-btn");
const logsTbody = document.getElementById("logs-tbody");
const paginationInfo = document.getElementById("pagination-info");
const paginationControls = document.getElementById("pagination-controls");
const tableHeaders = document.querySelectorAll("#violations-log-table th.sortable");

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

// Fetch and render violations log table
async function loadViolationsLog() {
    logsTbody.innerHTML = `
        <tr>
            <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 3rem;">
                <div style="display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
                    <span class="spinner" style="width: 20px; height: 20px; border-width: 2px;"></span>
                    <span>Retrieving log records...</span>
                </div>
            </td>
        </tr>
    `;

    const type = filterType.value;
    const site = filterSite.value;
    const camera = filterCamera.value;
    const dateStart = filterDateStart.value;
    const dateEnd = filterDateEnd.value;
    const search = searchInput.value;

    const { data: logs, totalCount } = await fetchViolations({
        type,
        site,
        camera,
        dateStart,
        dateEnd,
        search,
        sortBy,
        sortOrder,
        page: currentPage,
        limit
    });

    if (!logs || logs.length === 0) {
        logsTbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 4rem;">
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 0.75rem;">
                        <i data-lucide="folder-open" style="width: 40px; height: 40px; color: var(--text-muted);"></i>
                        <span style="font-weight: 500; font-size: 1rem;">No matching logs found</span>
                        <p style="font-size: 0.85rem; max-width: 300px; margin: 0 auto;">Try clearing filters or search terms to see all compliance records.</p>
                    </div>
                </td>
            </tr>
        `;
        paginationInfo.textContent = "Showing 0 to 0 of 0 entries";
        paginationControls.innerHTML = "";
        lucide.createIcons();
        return;
    }

    logsTbody.innerHTML = "";

    logs.forEach(log => {
        const tr = document.createElement("tr");
        
        // Date cell
        const dateCell = document.createElement("td");
        dateCell.textContent = formatFullDateTime(log.created_at);
        dateCell.style.whiteSpace = "nowrap";

        // Type badge cell
        const typeCell = document.createElement("td");
        let badgeClass = "status-violation";
        let iconName = "alert-octagon";
        
        if (log.type === "Compliant") {
            badgeClass = "status-compliant";
            iconName = "shield-check";
        } else if (log.type.includes("Helmet")) {
            iconName = "hard-hat";
        }
        
        typeCell.innerHTML = `
            <span class="status-badge ${badgeClass}">
                <i data-lucide="${iconName}" style="width: 14px; height: 14px;"></i>
                ${log.type}
            </span>
        `;

        // Site
        const siteCell = document.createElement("td");
        siteCell.textContent = log.site;

        // Camera
        const cameraCell = document.createElement("td");
        cameraCell.textContent = log.camera;
        cameraCell.style.fontWeight = "500";

        // Area
        const areaCell = document.createElement("td");
        areaCell.textContent = log.worker_area;

        // Confidence cell
        const confCell = document.createElement("td");
        confCell.textContent = `${Math.round(log.confidence * 100)}%`;
        confCell.style.fontWeight = "600";

        // Status badge cell
        const statusCell = document.createElement("td");
        if (log.type === "Compliant") {
            statusCell.innerHTML = `
                <span class="status-badge status-compliant" style="opacity: 0.7;">
                    <i data-lucide="check" style="width: 12px; height: 12px;"></i> OK
                </span>
            `;
        } else if (log.status === "Unresolved") {
            statusCell.innerHTML = `
                <span class="status-badge status-violation">
                    <i data-lucide="x-circle" style="width: 14px; height: 14px;"></i> Active
                </span>
            `;
        } else if (log.status === "Acknowledged") {
            statusCell.innerHTML = `
                <span class="status-badge status-warning">
                    <i data-lucide="eye-off" style="width: 14px; height: 14px;"></i> Acknowledged
                </span>
            `;
        } else {
            statusCell.innerHTML = `
                <span class="status-badge status-compliant">
                    <i data-lucide="check-circle" style="width: 14px; height: 14px;"></i> Resolved
                </span>
            `;
        }

        // Actions cell
        const actionCell = document.createElement("td");
        if (log.type !== "Compliant" && log.status !== "Resolved") {
            const resolveBtn = document.createElement("button");
            resolveBtn.className = "btn btn-success";
            resolveBtn.style.padding = "0.3rem 0.6rem";
            resolveBtn.style.fontSize = "0.75rem";
            resolveBtn.innerHTML = `<i data-lucide="check" style="width: 12px; height: 12px;"></i> Resolve`;
            resolveBtn.onclick = async () => {
                resolveBtn.disabled = true;
                resolveBtn.textContent = "Updating...";
                await updateViolationStatus(log.id, "Resolved");
                loadViolationsLog(); // Refresh log
            };
            actionCell.appendChild(resolveBtn);
        } else {
            actionCell.innerHTML = `<span style="color: var(--text-dark); font-size: 0.8rem;">—</span>`;
        }

        tr.appendChild(dateCell);
        tr.appendChild(typeCell);
        tr.appendChild(siteCell);
        tr.appendChild(cameraCell);
        tr.appendChild(areaCell);
        tr.appendChild(confCell);
        tr.appendChild(statusCell);
        tr.appendChild(actionCell);
        logsTbody.appendChild(tr);
    });

    // Update pagination labels
    const startEntry = (currentPage - 1) * limit + 1;
    const endEntry = Math.min(currentPage * limit, totalCount);
    paginationInfo.textContent = `Showing ${startEntry} to ${endEntry} of ${totalCount} entries`;

    // Render pagination control buttons
    renderPagination(totalCount);

    // Refresh Lucide icon renders
    lucide.createIcons();
}

// Render pagination links
function renderPagination(totalCount) {
    paginationControls.innerHTML = "";
    
    const totalPages = Math.ceil(totalCount / limit);
    if (totalPages <= 1) return;

    // Previous Button
    const prevBtn = document.createElement("button");
    prevBtn.className = "pagination-btn";
    prevBtn.innerHTML = `<i data-lucide="chevron-left" style="width: 14px; height: 14px; display: block;"></i>`;
    prevBtn.disabled = currentPage === 1;
    prevBtn.onclick = () => {
        if (currentPage > 1) {
            currentPage--;
            loadViolationsLog();
        }
    };
    paginationControls.appendChild(prevBtn);

    // Number Buttons (Smart display: current page, adjacent pages, and boundaries)
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
            const pageBtn = document.createElement("button");
            pageBtn.className = `pagination-btn ${currentPage === i ? 'active' : ''}`;
            pageBtn.textContent = i;
            pageBtn.onclick = () => {
                if (currentPage !== i) {
                    currentPage = i;
                    loadViolationsLog();
                }
            };
            paginationControls.appendChild(pageBtn);
        } else if (i === currentPage - 2 || i === currentPage + 2) {
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
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.onclick = () => {
        if (currentPage < totalPages) {
            currentPage++;
            loadViolationsLog();
        }
    };
    paginationControls.appendChild(nextBtn);
}

// Sort listener configuration
tableHeaders.forEach(th => {
    th.addEventListener("click", () => {
        const column = th.getAttribute("data-column");
        
        // Remove current sort classes
        tableHeaders.forEach(h => {
            if (h !== th) {
                h.classList.remove("sort-asc", "sort-desc");
            }
        });

        if (sortBy === column) {
            // Toggle order
            sortOrder = sortOrder === "asc" ? "desc" : "asc";
            th.classList.toggle("sort-asc", sortOrder === "asc");
            th.classList.toggle("sort-desc", sortOrder === "desc");
        } else {
            // Set new sort column
            sortBy = column;
            sortOrder = "desc";
            th.classList.add("sort-desc");
            th.classList.remove("sort-asc");
        }

        // Reset page to 1 and load
        currentPage = 1;
        loadViolationsLog();
    });
});

// Search input debouncer
searchInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        currentPage = 1;
        loadViolationsLog();
    }, 300);
});

// Dropdown filters changes
[filterType, filterSite, filterCamera, filterDateStart, filterDateEnd].forEach(el => {
    if (el) {
        el.addEventListener("change", () => {
            currentPage = 1;
            loadViolationsLog();
        });
    }
});

// Clear Filters button handler
clearFiltersBtn.addEventListener("click", () => {
    searchInput.value = "";
    filterType.value = "all";
    if (filterSite) filterSite.value = "all";
    if (filterCamera) filterCamera.value = "all";
    if (filterDateStart) filterDateStart.value = "";
    if (filterDateEnd) filterDateEnd.value = "";
    currentPage = 1;
    loadViolationsLog();
});

// CSV Exporter
exportCsvBtn.addEventListener("click", async () => {
    exportCsvBtn.disabled = true;
    const originalText = exportCsvBtn.innerHTML;
    exportCsvBtn.innerHTML = `<span class="spinner" style="width: 14px; height: 14px; border-width: 2px; margin-right: 0.5rem; display: inline-block; vertical-align: middle;"></span> Exporting...`;

    const type = filterType.value;
    const site = filterSite.value;
    const camera = filterCamera.value;
    const dateStart = filterDateStart.value;
    const dateEnd = filterDateEnd.value;
    const search = searchInput.value;

    // Fetch all records matching the current filters (large page size)
    const { data: allMatchingLogs } = await fetchViolations({
        type,
        site,
        camera,
        dateStart,
        dateEnd,
        search,
        sortBy,
        sortOrder,
        page: 1,
        limit: 1000 // reasonable limit to capture everything
    });

    if (!allMatchingLogs || allMatchingLogs.length === 0) {
        alert("No records found to export.");
        exportCsvBtn.disabled = false;
        exportCsvBtn.innerHTML = originalText;
        return;
    }

    // Compose CSV string
    const csvHeaders = ["Log ID", "Timestamp", "Violation Type", "Site Location", "CCTV Camera", "Worker Area", "Confidence Score", "Status"];
    const csvRows = [csvHeaders.join(",")];

    allMatchingLogs.forEach(row => {
        const formattedDate = new Date(row.created_at).toISOString();
        const escapedType = `"${row.type.replace(/"/g, '""')}"`;
        const escapedSite = `"${row.site.replace(/"/g, '""')}"`;
        const escapedCamera = `"${row.camera.replace(/"/g, '""')}"`;
        const escapedArea = `"${row.worker_area.replace(/"/g, '""')}"`;
        const confidencePct = `${Math.round(row.confidence * 100)}%`;
        const status = row.status;

        const rowValues = [
            row.id,
            formattedDate,
            escapedType,
            escapedSite,
            escapedCamera,
            escapedArea,
            confidencePct,
            status
        ];
        
        csvRows.push(rowValues.join(","));
    });

    const csvContent = csvRows.join("\n");
    
    // Create download link
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    
    link.setAttribute("href", url);
    
    const timestampStr = new Date().toISOString().slice(0, 10);
    link.setAttribute("download", `ppe_compliance_export_${timestampStr}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Reset button
    exportCsvBtn.disabled = false;
    exportCsvBtn.innerHTML = originalText;
});

// Load on DOM ready
document.addEventListener("DOMContentLoaded", loadViolationsLog);
