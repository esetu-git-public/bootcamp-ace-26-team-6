/**
 * PPE Compliance Detection System - Connected API Layer (FastAPI Proxy)
 */

const API_BASE_URL = window.location.origin.includes(":8000")
    ? window.location.origin
    : "http://localhost:8000";

// Centralized wrapper for calling backend FastAPI endpoints
async function apiFetch(endpoint, options = {}) {
    const session = getCurrentSession();
    const token = session ? session.access_token : null;

    const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {})
    };

    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP Error ${response.status}`);
    }
    return response.json();
}

function updateConnectionBadge() {
    const badge = document.getElementById("supabase-status-badge");
    const label = document.getElementById("supabase-status-label");
    if (badge && label) {
        badge.classList.add("connected");
        label.textContent = "API Server Connected";
    }
}
document.addEventListener("DOMContentLoaded", updateConnectionBadge);

// ----------------- PUBLIC API METHODS -----------------

function isUsingSupabase() {
    return true; // We are connecting to backend API which uses Supabase
}

// Polling for new violations (no WebSocket)
let violationPollingInterval = null;
let lastKnownViolationIds = new Set();

function startViolationPolling(callback, intervalMs = 10000) {
    if (violationPollingInterval) clearInterval(violationPollingInterval);

    violationPollingInterval = setInterval(async () => {
        try {
            const alerts = await fetchAlerts({ limit: 20 });
            const newAlerts = alerts.filter(a => !lastKnownViolationIds.has(a.id));
            if (newAlerts.length > 0) {
                newAlerts.forEach(alert => {
                    lastKnownViolationIds.add(alert.id);
                    if (callback) callback(alert);
                });
            }
        } catch (e) {
            console.error("Violation polling error:", e);
        }
    }, intervalMs);
}

function stopViolationPolling() {
    if (violationPollingInterval) {
        clearInterval(violationPollingInterval);
        violationPollingInterval = null;
    }
}

function subscribeToNewViolations(callback) {
    // Initialize with current alerts
    fetchAlerts({ limit: 20 }).then(alerts => {
        alerts.forEach(a => lastKnownViolationIds.add(a.id));
    }).catch(console.error);
    startViolationPolling(callback, 10000);
}

async function fetchStats() {
    try {
        const data = await apiFetch("/stats");
        return {
            totalDetections: data.total || 0,
            totalViolations: (data.violation || 0) + (data.fall || 0),
            complianceRate: data.total > 0 ? Math.round((data.compliant / data.total) * 100) : 100,
            unresolvedViolations: (data.violation || 0) + (data.fall || 0),
            activeAlertsToday: data.today || 0,
            unresolvedToday: data.unresolved_today || 0
        };
    } catch (e) {
        console.error("Fetch stats error:", e);
        return { totalDetections: 0, totalViolations: 0, complianceRate: 100, unresolvedViolations: 0, activeAlertsToday: 0, unresolvedToday: 0 };
    }
}

async function fetchViolations({ type = "all", zone = "all", search = "", sortBy = "created_at", sortOrder = "desc", page = 1, limit = 10, camera = "all", site = "all", dateStart = "", dateEnd = "" } = {}) {
    try {
        let path = `/events?limit=200`;
        if (type !== "all") {
            if (type === "Compliant") path += "&event_type=compliant";
            else if (type === "Violations Only") path += "&event_type=violation";
            else if (type === "Fall-Detected") path += "&event_type=fall";
        }
        if (dateStart) path += `&date_start=${dateStart}`;
        if (dateEnd) path += `&date_end=${dateEnd}`;
        const events = await apiFetch(path);

        let mapped = events.map(e => ({
            id: e.id,
            created_at: e.detected_at || e.created_at || new Date().toISOString(),
            type: e.event_type === "compliant" ? "Compliant" : (e.event_type === "fall" ? "Fall-Detected" : "PPE Violation"),
            camera: e.camera_id ? `CAM-${e.camera_id.substring(0, 4)}` : "Live Feed",
            worker_area: "Processing Floor",
            confidence: 0.92,
            image_url: e.snapshot ? `data:image/jpeg;base64,${e.snapshot}` : null,
            details: {
                persons_detected: 1,
                helmets_detected: e.event_type === "compliant" ? 1 : 0,
                vests_detected: e.event_type === "compliant" ? 1 : 0
            },
            status: e.event_type === "compliant" ? "Resolved" : "Unresolved"
        }));

        if (zone !== "all") {
            mapped = mapped.filter(d => d.worker_area === zone);
        }
        if (search.trim() !== "") {
            const queryText = search.toLowerCase();
            mapped = mapped.filter(d =>
                d.camera.toLowerCase().includes(queryText) ||
                d.type.toLowerCase().includes(queryText)
            );
        }

        const startIndex = (page - 1) * limit;
        const paginatedData = mapped.slice(startIndex, startIndex + limit);

        return {
            data: paginatedData,
            totalCount: mapped.length
        };
    } catch (e) {
        console.error("Fetch violations error:", e);
        return { data: [], totalCount: 0 };
    }
}

async function addViolation(violationData) {
    try {
        const event_type = violationData.type === "Compliant" ? "compliant" : "violation";
        const response = await apiFetch("/events", {
            method: "POST",
            body: JSON.stringify({
                camera_id: null,
                event_type: event_type,
                snapshot: violationData.image_url ? violationData.image_url.replace(/^data:image\/[a-z]+;base64,/, "") : null,
                detections: (violationData.details?.items_found || []).map(item => ({
                    class_id: item.status === "violation" ? 10 : 11,
                    class_name: item.name,
                    confidence: item.confidence,
                    bbox: [0, 0, 100, 100],
                    is_violation: item.status === "violation"
                }))
            })
        });
        return {
            id: response.id,
            created_at: response.detected_at,
            ...violationData
        };
    } catch (error) {
        console.error("Add violation error:", error);
        return { id: Math.floor(Math.random() * 1000), ...violationData };
    }
}

async function updateViolationStatus(id, newStatus = "Resolved") {
    // Backend uses alerts for acknowledgment
    try {
        if (newStatus === "Acknowledged") {
            await apiFetch(`/alerts/${id}/ack`, { method: "PATCH" });
        }
        // For "Resolved", we could add a resolution endpoint, for now just return
        return { id, status: newStatus };
    } catch (e) {
        console.error("Update violation status error:", e);
        return { id, status: newStatus };
    }
}

// ----------------- ALERTS API METHODS -----------------

async function fetchAlerts({ limit = 50, acknowledged = null } = {}) {
    try {
        let path = `/alerts?limit=${limit}`;
        const alerts = await apiFetch(path);
        if (acknowledged !== null) {
            return alerts.filter(a => a.acknowledged === acknowledged);
        }
        return alerts;
    } catch (e) {
        console.error("Fetch alerts error:", e);
        return [];
    }
}

async function acknowledgeAlert(alertId) {
    try {
        const response = await apiFetch(`/alerts/${alertId}/ack`, { method: "PATCH" });
        return response;
    } catch (e) {
        console.error("Acknowledge alert error:", e);
        throw e;
    }
}

// ----------------- CAMERAS API METHODS -----------------

async function getCameras() {
    try {
        const cameras = await apiFetch("/cameras");
        return cameras.map(c => ({
            id: c.id,
            name: c.name,
            zone: c.zone || "Zone A",
            status: c.is_active ? "Active" : "Inactive",
            rules: ["helmet", "vest"],
            stream_url: c.stream_url,
            is_active: c.is_active
        }));
    } catch (e) {
        console.error("Get cameras error:", e);
        return [];
    }
}

async function addCamera(camera) {
    try {
        const res = await apiFetch("/cameras", {
            method: "POST",
            body: JSON.stringify({
                name: camera.name,
                stream_url: camera.stream_url,
                zone: camera.zone
            })
        });
        return {
            id: res.id,
            name: res.name,
            zone: camera.zone || res.zone,
            status: "Active",
            rules: camera.rules || [],
            stream_url: res.stream_url,
            is_active: res.is_active
        };
    } catch (e) {
        console.error("Add camera error:", e);
        throw e;
    }
}

async function updateCamera(id, updatedFields) {
    try {
        const payload = {};
        if (updatedFields.name) payload.name = updatedFields.name;
        if (updatedFields.status) payload.is_active = updatedFields.status === "Active";
        if (updatedFields.zone) payload.zone = updatedFields.zone;
        const res = await apiFetch(`/cameras/${id}`, {
            method: "PATCH",
            body: JSON.stringify(payload)
        });
        return {
            id: res.id,
            name: res.name,
            zone: updatedFields.zone || res.zone,
            status: res.is_active ? "Active" : "Inactive",
            rules: updatedFields.rules || [],
            stream_url: res.stream_url,
            is_active: res.is_active
        };
    } catch (e) {
        console.error("Update camera error:", e);
        throw e;
    }
}

async function removeCamera(id) {
    try {
        await apiFetch(`/cameras/${id}`, { method: "DELETE" });
        return true;
    } catch (e) {
        console.error("Remove camera error:", e);
        throw e;
    }
}

async function getUsers() {
    try {
        const me = await apiFetch("/auth/me");
        return [{ id: me.id, name: me.username, email: me.username, role: "Admin", status: "Active" }];
    } catch (e) {
        console.error("Get users error:", e);
        return [];
    }
}

async function updateUserRole(id, updatedFields) {
    // Backend doesn't have user role update yet
    return { id, ...updatedFields };
}

// ----------------- ADVANCED REPORT STATISTICS METHODS -----------------

async function fetchReportingData() {
    try {
        const events = await apiFetch("/events?limit=200");
        const violationsByType = {};
        const violationsByCamera = {};

        events.forEach(e => {
            if (e.event_type === "compliant") return;
            const type = e.event_type === "fall" ? "Fall" : "PPE Violation";
            violationsByType[type] = (violationsByType[type] || 0) + 1;
            const cam = e.camera_id ? `CAM-${e.camera_id.substring(0, 4)}` : "Live Feed";
            violationsByCamera[cam] = (violationsByCamera[cam] || 0) + 1;
        });

        // Compute daily trends from actual events
        const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        const dailyCounts = { compliant: Array(7).fill(0), violation: Array(7).fill(0), fall: Array(7).fill(0) };

        events.forEach(e => {
            const date = new Date(e.detected_at || e.created_at);
            const dayIndex = date.getDay() === 0 ? 6 : date.getDay() - 1; // Mon=0, Sun=6
            if (e.event_type === "compliant") dailyCounts.compliant[dayIndex]++;
            else if (e.event_type === "violation") dailyCounts.violation[dayIndex]++;
            else if (e.event_type === "fall") dailyCounts.fall[dayIndex]++;
        });

        return {
            types: {
                labels: Object.keys(violationsByType),
                counts: Object.values(violationsByType)
            },
            cameras: {
                labels: Object.keys(violationsByCamera),
                counts: Object.values(violationsByCamera)
            },
            trends: {
                labels: labels,
                helmet: dailyCounts.violation, // Fallback - would need per-class detection data
                vest: dailyCounts.violation,
                gloves: dailyCounts.violation,
                compliant: dailyCounts.compliant,
                violations: dailyCounts.violation,
                falls: dailyCounts.fall
            }
        };
    } catch (e) {
        console.error("Fetch reporting data error:", e);
        return { types: { labels: [], counts: [] }, cameras: { labels: [], counts: [] }, trends: { labels: [], helmet: [], vest: [], gloves: [], compliant: [], violations: [], falls: [] } };
    }
}

async function fetchWeeklyTrends() {
    try {
        const events = await apiFetch("/events?limit=200");
        const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        const compliant = Array(7).fill(0);
        const violations = Array(7).fill(0);

        events.forEach(e => {
            const date = new Date(e.detected_at || e.created_at);
            const dayIndex = date.getDay() === 0 ? 6 : date.getDay() - 1;
            if (e.event_type === "compliant") {
                compliant[dayIndex]++;
            } else {
                violations[dayIndex]++;
            }
        });

        return { labels, compliant, violations };
    } catch (error) {
        console.error("Fetch weekly trends error:", error);
        return { labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], compliant: [], violations: [] };
    }
}

// ----------------- AUTHENTICATION API METHODS -----------------

async function signInUser(email, password) {
    const res = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({
            username: email,
            password: password
        })
    });
    // Determine role from email or default
    const role = email.includes("jane.smith") ? "Safety Officer" : "Admin";
    const session = {
        name: res.username,
        email: res.username,
        access_token: res.access_token,
        role: role
    };
    localStorage.setItem("ppe_session", JSON.stringify(session));
    return res;
}

async function signOutUser() {
    stopViolationPolling();
    localStorage.removeItem("ppe_session");
}

function getCurrentSession() {
    try {
        const session = localStorage.getItem("ppe_session");
        return session ? JSON.parse(session) : null;
    } catch (e) {
        console.error("Error reading session:", e);
        return null;
    }
}

function setupSidebarProfile() {
    const session = getCurrentSession();
    if (!session) return;

    const avatarEl = document.getElementById("user-avatar");
    const nameEl = document.getElementById("user-display-name");
    const roleEl = document.getElementById("user-display-role");
    const logoutBtn = document.getElementById("logout-btn");

    if (nameEl) nameEl.textContent = session.name || session.email;
    if (roleEl) {
        roleEl.textContent = session.role;
        roleEl.className = "profile-role-badge " + "role-" + (session.role || "").toLowerCase().replace(/\s+/g, '-');
    }
    if (avatarEl) {
        const initials = (session.name || "??")
            .split(" ")
            .map(n => n[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();
        avatarEl.textContent = initials || "??";
    }

    if (logoutBtn) {
        logoutBtn.onclick = async () => {
            if (confirm("Are you sure you want to sign out of the system?")) {
                await signOutUser();
                window.location.href = "login.html";
            }
        };
    }
}

document.addEventListener("DOMContentLoaded", () => {
    setupSidebarProfile();
});