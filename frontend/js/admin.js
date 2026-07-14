// PPE Compliance Detection System - Admin Settings Logic

// Tab Switching
function switchTab(tabId) {
    // Hide all contents
    const contents = document.querySelectorAll(".tab-content");
    contents.forEach(c => c.classList.remove("active"));

    // Deactivate all buttons
    const buttons = document.querySelectorAll(".tab-btn");
    buttons.forEach(b => b.classList.remove("active"));

    // Activate selected
    document.getElementById(tabId).classList.add("active");
    
    // Find matching button to activate
    const activeBtn = Array.from(buttons).find(b => b.getAttribute("onclick").includes(tabId));
    if (activeBtn) activeBtn.classList.add("active");

    // Load data based on tab selection
    if (tabId === "cameras-tab") {
        loadCameras();
    } else if (tabId === "settings-tab") {
        loadDetectionSettings();
    }
}

// ----------------- CAMERAS CONTROLLER -----------------

async function loadCameras() {
    const tbody = document.getElementById("cameras-tbody");
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 2rem;">
                <span class="spinner" style="width: 20px; height: 20px; border-width: 2px; margin-right: 0.5rem; display: inline-block; vertical-align: middle;"></span>
                Loading camera settings...
            </td>
        </tr>
    `;

    const cameras = await getCameras();
    
    if (!cameras || cameras.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 2rem;">
                    No cameras configured yet. Use the sidebar form to add one.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = "";
    cameras.forEach(cam => {
        const tr = document.createElement("tr");
        
        // Name
        const nameCell = document.createElement("td");
        nameCell.textContent = cam.name;
        nameCell.style.fontWeight = "600";
        
        // Zone
        const zoneCell = document.createElement("td");
        zoneCell.textContent = cam.zone || "—";

        // Status
        const statusCell = document.createElement("td");
        const isActive = cam.is_active;
        statusCell.innerHTML = `
            <span class="status-badge ${isActive ? 'status-compliant' : 'status-violation'}">
                <span class="dot" style="width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 0.25rem; background-color: ${isActive ? 'var(--color-compliant)' : 'var(--color-violation)'}"></span>
                ${cam.status || (isActive ? 'Active' : 'Inactive')}
            </span>
        `;

        // Actions
        const actionsCell = document.createElement("td");
        
        // Toggle Active button
        const toggleBtn = document.createElement("button");
        toggleBtn.className = "btn btn-outline";
        toggleBtn.style.padding = "0.25rem 0.5rem";
        toggleBtn.style.fontSize = "0.75rem";
        toggleBtn.style.marginRight = "0.5rem";
        toggleBtn.innerHTML = `<i data-lucide="toggle-left" style="width: 14px; height: 14px;"></i> Toggle`;
        toggleBtn.onclick = async () => {
            const nextStatus = cam.is_active ? "Inactive" : "Active";
            toggleBtn.disabled = true;
            await updateCamera(cam.id, { status: nextStatus });
            loadCameras();
        };

        // Edit button
        const editBtn = document.createElement("button");
        editBtn.className = "btn btn-outline";
        editBtn.style.padding = "0.25rem 0.5rem";
        editBtn.style.fontSize = "0.75rem";
        editBtn.style.marginRight = "0.5rem";
        editBtn.innerHTML = `<i data-lucide="edit-3" style="width: 14px; height: 14px;"></i> Edit`;
        editBtn.onclick = () => {
            openEditModal(cam);
        };

        // Delete button
        const delBtn = document.createElement("button");
        delBtn.className = "btn btn-danger";
        delBtn.style.padding = "0.25rem 0.5rem";
        delBtn.style.fontSize = "0.75rem";
        delBtn.innerHTML = `<i data-lucide="trash-2" style="width: 14px; height: 14px;"></i> Delete`;
        delBtn.onclick = async () => {
            if (confirm(`Are you sure you want to delete ${cam.name}?`)) {
                delBtn.disabled = true;
                await removeCamera(cam.id);
                loadCameras();
            }
        };

        actionsCell.appendChild(toggleBtn);
        actionsCell.appendChild(editBtn);
        actionsCell.appendChild(delBtn);

        tr.appendChild(nameCell);
        tr.appendChild(zoneCell);
        tr.appendChild(statusCell);
        tr.appendChild(actionsCell);
        tbody.appendChild(tr);
    });

    lucide.createIcons();
}

// Add Camera Form listener
document.getElementById("add-camera-form").addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("cam-name").value;
    const zone = document.getElementById("cam-zone").value;
    const stream_url = document.getElementById("cam-stream").value;

    const submitBtn = e.target.querySelector("button[type='submit']");
    submitBtn.disabled = true;
    submitBtn.textContent = "Saving...";

    await addCamera({
        name,
        zone,
        stream_url,
        status: "Active"
    });

    // Reset Form
    document.getElementById("cam-name").value = "";
    document.getElementById("cam-zone").value = "";
    document.getElementById("cam-stream").value = "";

    // Restore Form Submit
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<i data-lucide="plus-circle"></i> Add Camera`;
    lucide.createIcons();
    
    // Reload UI
    loadCameras();
});

// ----------------- DETECTION SETTINGS CONTROLLER -----------------

async function loadDetectionSettings() {
    try {
        const settings = await getSettings();
        
        // Violation classes
        const violationClasses = settings.violation_class_ids || [6, 7, 8, 9, 10];
        document.getElementById("set-helmet").checked = violationClasses.includes(8);
        document.getElementById("set-vest").checked = violationClasses.includes(10);
        document.getElementById("set-gloves").checked = violationClasses.includes(6);
        document.getElementById("set-goggles").checked = violationClasses.includes(7);
        document.getElementById("set-mask").checked = violationClasses.includes(9);
        document.getElementById("set-fall").checked = violationClasses.includes(0);
        
        // Alert preferences
        document.getElementById("alert-violation").checked = settings.alert_on_violation !== false;
        document.getElementById("alert-fall").checked = settings.alert_on_fall !== false;
    } catch (e) {
        console.error("Failed to load detection settings:", e);
    }
}

// Detection Settings Form listener
document.getElementById("detection-settings-form").addEventListener("submit", async (e) => {
    e.preventDefault();

    const violationClassIds = [];
    if (document.getElementById("set-helmet").checked) violationClassIds.push(8); // NO-Hardhat
    if (document.getElementById("set-vest").checked) violationClassIds.push(10); // NO-Safety Vest
    if (document.getElementById("set-gloves").checked) violationClassIds.push(6); // NO-Gloves
    if (document.getElementById("set-goggles").checked) violationClassIds.push(7); // NO-Goggles
    if (document.getElementById("set-mask").checked) violationClassIds.push(9); // NO-Mask
    if (document.getElementById("set-fall").checked) violationClassIds.push(0); // Fall-Detected

    const alertOnViolation = document.getElementById("alert-violation").checked;
    const alertOnFall = document.getElementById("alert-fall").checked;

    const submitBtn = e.target.querySelector("button[type='submit']");
    submitBtn.disabled = true;
    submitBtn.textContent = "Saving...";

    try {
        await updateSettings({
            violation_class_ids: violationClassIds,
            alert_on_violation: alertOnViolation,
            alert_on_fall: alertOnFall
        });
        alert("Detection settings saved successfully!");
    } catch (error) {
        alert("Failed to save settings: " + error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<i data-lucide="save"></i> Save Detection Settings`;
        lucide.createIcons();
    }
});

// ----------------- EDIT CAMERA RULES MODAL CONTROLLER -----------------

function openEditModal(cam) {
    document.getElementById("edit-cam-id").value = cam.id;
    document.getElementById("edit-cam-name").value = cam.name;
    document.getElementById("edit-cam-zone").value = cam.zone || "";
    document.getElementById("edit-cam-stream").value = cam.stream_url || "";
    
    document.getElementById("edit-camera-modal").style.display = "flex";
    lucide.createIcons();
}

function closeEditModal() {
    document.getElementById("edit-camera-modal").style.display = "none";
}

// Edit Form submit listener
document.getElementById("edit-camera-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const id = document.getElementById("edit-cam-id").value;
    const zone = document.getElementById("edit-cam-zone").value.trim();
    const stream_url = document.getElementById("edit-cam-stream").value.trim();
    
    const submitBtn = e.target.querySelector("button[type='submit']");
    submitBtn.disabled = true;
    submitBtn.textContent = "Saving...";
    
    try {
        await updateCamera(id, { zone, stream_url });
        closeEditModal();
        loadCameras();
    } catch (error) {
        alert("Failed to update camera: " + error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Save Changes";
    }
});

// Init view
document.addEventListener("DOMContentLoaded", () => {
    loadCameras();
    loadDetectionSettings();
});