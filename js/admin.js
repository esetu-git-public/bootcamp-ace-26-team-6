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
    } else if (tabId === "users-tab") {
        loadUsers();
    }
}

// ----------------- CAMERAS CONTROLLER -----------------

async function loadCameras() {
    const tbody = document.getElementById("cameras-tbody");
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">
                <span class="spinner" style="width: 20px; height: 20px; border-width: 2px; margin-right: 0.5rem; display: inline-block; vertical-align: middle;"></span>
                Loading camera settings...
            </td>
        </tr>
    `;

    const cameras = await getCameras();
    
    if (!cameras || cameras.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">
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
        
        // Site
        const siteCell = document.createElement("td");
        siteCell.textContent = cam.site;

        // Rules formatted
        const rulesCell = document.createElement("td");
        const capitalizedRules = cam.rules.map(r => r.charAt(0).toUpperCase() + r.slice(1));
        rulesCell.innerHTML = capitalizedRules.map(r => `<span class="status-badge status-compliant" style="font-size: 0.75rem; background-color: var(--color-primary-bg); border-color: rgba(59, 130, 246, 0.2); color: var(--color-primary); margin-right: 0.25rem;">${r}</span>`).join(" ");

        // Status
        const statusCell = document.createElement("td");
        const isActive = cam.status === "Active";
        statusCell.innerHTML = `
            <span class="status-badge ${isActive ? 'status-compliant' : 'status-violation'}">
                <span class="dot" style="width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 0.25rem; background-color: ${isActive ? 'var(--color-compliant)' : 'var(--color-violation)'}"></span>
                ${cam.status}
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
            const nextStatus = cam.status === "Active" ? "Inactive" : "Active";
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
        tr.appendChild(siteCell);
        tr.appendChild(rulesCell);
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
    const site = document.getElementById("cam-site").value;
    
    // Gather rules
    const rules = [];
    if (document.getElementById("rule-helmet").checked) rules.push("helmet");
    if (document.getElementById("rule-vest").checked) rules.push("vest");
    if (document.getElementById("rule-gloves").checked) rules.push("gloves");

    const submitBtn = e.target.querySelector("button[type='submit']");
    submitBtn.disabled = true;
    submitBtn.textContent = "Saving...";

    await addCamera({
        name,
        site,
        status: "Active",
        rules
    });

    // Reset Form
    document.getElementById("cam-name").value = "";
    document.getElementById("rule-helmet").checked = true;
    document.getElementById("rule-vest").checked = true;
    document.getElementById("rule-gloves").checked = false;

    // Restore Form Submit
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<i data-lucide="plus-circle"></i> Add Camera`;
    
    // Reload UI
    loadCameras();
});

// ----------------- USERS CONTROLLER -----------------

async function loadUsers() {
    const tbody = document.getElementById("users-tbody");
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 2rem;">
                <span class="spinner" style="width: 20px; height: 20px; border-width: 2px; margin-right: 0.5rem; display: inline-block; vertical-align: middle;"></span>
                Loading user accounts...
            </td>
        </tr>
    `;

    const users = await getUsers();
    tbody.innerHTML = "";

    users.forEach(user => {
        const tr = document.createElement("tr");

        // Name
        const nameCell = document.createElement("td");
        nameCell.textContent = user.name;
        nameCell.style.fontWeight = "600";

        // Email
        const emailCell = document.createElement("td");
        emailCell.textContent = user.email;

        // Role Dropdown selector
        const roleCell = document.createElement("td");
        const select = document.createElement("select");
        select.className = "form-select";
        select.style.padding = "0.35rem 0.5rem";
        select.style.fontSize = "0.85rem";
        select.style.maxWidth = "160px";
        
        const roles = ["Admin", "Safety Officer", "Observer"];
        roles.forEach(r => {
            const opt = document.createElement("option");
            opt.value = r;
            opt.textContent = r;
            if (user.role === r) opt.selected = true;
            select.appendChild(opt);
        });

        select.onchange = async () => {
            select.disabled = true;
            await updateUserRole(user.id, { role: select.value });
            select.disabled = false;
        };
        roleCell.appendChild(select);

        // Status Access Control toggle
        const statusCell = document.createElement("td");
        const isSuspended = user.status === "Suspended";
        
        const toggleBtn = document.createElement("button");
        toggleBtn.className = `btn ${isSuspended ? 'btn-danger' : 'btn-outline'}`;
        toggleBtn.style.padding = "0.35rem 0.75rem";
        toggleBtn.style.fontSize = "0.8rem";
        toggleBtn.innerHTML = isSuspended 
            ? `<i data-lucide="lock" style="width: 14px; height: 14px;"></i> Access Suspended` 
            : `<i data-lucide="unlock" style="width: 14px; height: 14px;"></i> Active`;
            
        toggleBtn.onclick = async () => {
            const nextStatus = user.status === "Active" ? "Suspended" : "Active";
            toggleBtn.disabled = true;
            await updateUserRole(user.id, { status: nextStatus });
            loadUsers();
        };
        statusCell.appendChild(toggleBtn);

        tr.appendChild(nameCell);
        tr.appendChild(emailCell);
        tr.appendChild(roleCell);
        tr.appendChild(statusCell);
        tbody.appendChild(tr);
    });

    lucide.createIcons();
}

// Init view
document.addEventListener("DOMContentLoaded", () => {
    loadCameras();
});

// ----------------- EDIT CAMERA RULES MODAL CONTROLLER -----------------

function openEditModal(cam) {
    document.getElementById("edit-cam-id").value = cam.id;
    document.getElementById("edit-cam-name").value = cam.name;
    document.getElementById("edit-cam-site").value = cam.site;
    
    // Set checkbox checked states
    document.getElementById("edit-rule-helmet").checked = cam.rules.includes("helmet");
    document.getElementById("edit-rule-vest").checked = cam.rules.includes("vest");
    document.getElementById("edit-rule-gloves").checked = cam.rules.includes("gloves");
    
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
    const site = document.getElementById("edit-cam-site").value.trim();
    
    const rules = [];
    if (document.getElementById("edit-rule-helmet").checked) rules.push("helmet");
    if (document.getElementById("edit-rule-vest").checked) rules.push("vest");
    if (document.getElementById("edit-rule-gloves").checked) rules.push("gloves");
    
    const submitBtn = e.target.querySelector("button[type='submit']");
    submitBtn.disabled = true;
    submitBtn.textContent = "Saving...";
    
    try {
        await updateCamera(id, { site, rules });
        closeEditModal();
        loadCameras();
    } catch (error) {
        alert("Failed to update camera: " + error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Save Changes";
    }
});

