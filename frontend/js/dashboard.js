// PPE Compliance Detection System - Dashboard & Live Monitor Logic

let trendChart = null;
let audioAlarmEnabled = true;
let activeCameraId = null;
let activeCameraName = "CAM-01 Main Gate";
let activeCameraZone = "";
let currentStreamImg = null;
let alertsPollingInterval = null;
let shownAlertIds = new Set();
let audioCtx = null;

// Clock updates
function updateHudClock() {
    const clockEl = document.getElementById("hud-timestamp");
    if (clockEl) {
        const now = new Date();
        clockEl.textContent = now.toLocaleDateString() + " " + now.toLocaleTimeString();
    }
}
setInterval(updateHudClock, 1000);

// Audio Alert Synth Beep using Web Audio API
function playAlarmSound() {
    if (!audioAlarmEnabled) return;

    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }

        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        // Double Beep
        const now = audioCtx.currentTime;

        // Beep 1
        const osc1 = audioCtx.createOscillator();
        const gain1 = audioCtx.createGain();
        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(880, now); // A5 note
        gain1.gain.setValueAtTime(0.15, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc1.connect(gain1);
        gain1.connect(audioCtx.destination);
        osc1.start(now);
        osc1.stop(now + 0.12);

        // Beep 2
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.type = 'sawtooth';
        osc2.frequency.setValueAtTime(1046.5, now + 0.15); // C6 note
        gain2.gain.setValueAtTime(0.15, now + 0.15);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.start(now + 0.15);
        osc2.stop(now + 0.35);

    } catch (e) {
        console.warn("Web Audio Context blocked or unsupported: ", e);
    }
}

// ----------------- TOAST ALERTS POPUPS -----------------
function triggerFloatingToast(record) {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = "toast-alert";

    toast.innerHTML = `
        <div class="toast-alert-icon">
            <i data-lucide="alert-octagon" style="width: 20px; height: 20px;"></i>
        </div>
        <div class="toast-alert-content">
            <h4>Safety Violation Warning</h4>
            <p><strong>${record.type}</strong> detected at <strong>${record.camera}</strong> (${record.zone || "Unknown Zone"})!</p>
        </div>
        <button class="toast-close-btn">&times;</button>
    `;

    container.appendChild(toast);
    lucide.createIcons();

    // Sound chirp
    playAlarmSound();

    // Flash player hud briefly if active camera matches
    if (record.camera === activeCameraName) {
        const player = document.getElementById("video-feed-player");
        if (player) {
            player.classList.add("alarm-active");
            setTimeout(() => player.classList.remove("alarm-active"), 4000);
        }
    }

    // Close button
    const closeBtn = toast.querySelector(".toast-close-btn");
    closeBtn.onclick = () => {
        toast.classList.add("toast-exit");
        setTimeout(() => toast.remove(), 300);
    };

    // Auto dismiss after 6 seconds
    setTimeout(() => {
        if (toast.parentNode) {
            toast.classList.add("toast-exit");
            setTimeout(() => toast.remove(), 300);
        }
    }, 6000);
}

// Subscribe to new violations via polling
subscribeToNewViolations((newRecord) => {
    // Only warn if it's a real violation, not compliance checks
    if (newRecord.type !== "Compliant") {
        triggerFloatingToast(newRecord);
        loadAlertsTicker(); // Reload ticker
    }

    // Refresh general stats and weekly charts
    loadDashboardStats();
    renderTrendsChart();
});

// Audio controls toggle
const audioBtn = document.getElementById("audio-alarm-btn");
if (audioBtn) {
    audioBtn.addEventListener("click", () => {
        audioAlarmEnabled = !audioAlarmEnabled;
        if (audioAlarmEnabled) {
            audioBtn.innerHTML = `<i data-lucide="volume-2"></i> <span>Alarm Sound: ON</span>`;
            audioBtn.classList.remove("btn-outline");
            audioBtn.classList.add("btn-primary");
            // Try to trigger a silent context initialization
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } else {
            audioBtn.innerHTML = `<i data-lucide="volume-x"></i> <span>Alarm Sound: OFF</span>`;
            audioBtn.classList.remove("btn-primary");
            audioBtn.classList.add("btn-outline");
        }
        lucide.createIcons();
    });
}

// ----------------- LIVE FEED - REAL MJPEG STREAM -----------------
function initLiveStream(cameraId) {
    const player = document.getElementById("video-feed-player");
    if (!player) return;

    let img = document.getElementById("live-feed-img");
    if (!img) {
        img = document.createElement("img");
        img.id = "live-feed-img";
        img.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:1";
        player.appendChild(img);
    }

    const canvas = document.getElementById("live-feed-canvas");
    if (canvas) canvas.style.display = "none";

    const session = getCurrentSession();
    const token = session?.access_token;
    img.src = `/camera/${cameraId}/stream?token=${encodeURIComponent(token)}`;
    currentStreamImg = img;
}

function stopLiveStream() {
    if (currentStreamImg) {
        currentStreamImg.src = "";
        currentStreamImg = null;
    }
}

// Helper: Fetch active camera rules from database
async function updateActiveCameraRules() {
    try {
        const cameras = await getCameras();
        const currentCam = cameras.find(c => c.id === activeCameraId);
        if (currentCam) {
            // Camera rules are now at user level (violation_class_ids in settings)
        }
    } catch (e) {
        console.error("Failed to fetch active camera rules:", e);
    }
}

// Helper: Populate camera selector dropdown dynamically from database
async function populateCameraSelector() {
    const selector = document.getElementById("camera-feed-select");
    if (!selector) return;

    try {
        const cameras = await getCameras();
        // Filter only Active status cameras
        const activeCams = cameras.filter(c => c.is_active);

        selector.innerHTML = "";
        activeCams.forEach(cam => {
            const opt = document.createElement("option");
            opt.value = cam.id; // Use UUID as value
            opt.textContent = cam.name;
            opt.dataset.zone = cam.zone || "";
            selector.appendChild(opt);
        });

        // If activeCameraId is not in the active cameras list, set to first active camera
        if (activeCams.length > 0) {
            const stillExists = activeCams.some(c => c.id === activeCameraId);
            if (!stillExists) {
                activeCameraId = activeCams[0].id;
                activeCameraName = activeCams[0].name;
                activeCameraZone = activeCams[0].zone || "";
                const hudCam = document.getElementById("hud-camera-name");
                const hudZone = document.getElementById("hud-zone");
                if (hudCam) hudCam.textContent = activeCameraName;
                if (hudZone) hudZone.textContent = activeCameraZone;
            }
        }
    } catch (e) {
        console.error("Failed to populate camera selector dropdown:", e);
    }
}

// Camera selector listener
const camSelect = document.getElementById("camera-feed-select");
if (camSelect) {
    camSelect.addEventListener("change", async (e) => {
        activeCameraId = e.target.value;
        const selectedOpt = e.target.options[e.target.selectedIndex];
        activeCameraName = selectedOpt?.textContent || activeCameraName;
        activeCameraZone = selectedOpt?.dataset.zone || "";

        // Update HUD display labels
        const hudCam = document.getElementById("hud-camera-name");
        const hudZone = document.getElementById("hud-zone");
        if (hudCam) hudCam.textContent = activeCameraName;
        if (hudZone) hudZone.textContent = activeCameraZone;

        // Switch stream
        initLiveStream(activeCameraId);

        // Trigger a beep to indicate visual switcher activated
        if (audioCtx) {
            const now = audioCtx.currentTime;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.frequency.setValueAtTime(500, now);
            gain.gain.setValueAtTime(0.05, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.1);
        }
    });
}

// Alerts Polling
function startAlertsPolling() {
    if (alertsPollingInterval) clearInterval(alertsPollingInterval);

    alertsPollingInterval = setInterval(async () => {
        try {
            const alerts = await fetchAlerts({ limit: 20 });
            const unacked = alerts.filter(a => !a.acknowledged);
            if (unacked.length > 0) {
                unacked.forEach(checkAndToast);
            }
            loadAlertsTicker();
        } catch (e) { console.error("Alerts polling failed", e); }
    }, 10000);
}

function stopAlertsPolling() {
    if (alertsPollingInterval) {
        clearInterval(alertsPollingInterval);
        alertsPollingInterval = null;
    }
}

function checkAndToast(alert) {
    if (!shownAlertIds.has(alert.id)) {
        shownAlertIds.add(alert.id);
        // Get camera name
        const cameraName = alert.camera_id ? `CAM-${alert.camera_id.substring(0,4)}` : "Unknown";
        triggerFloatingToast({
            type: alert.alert_type === "fall" ? "Fall Detected" : "PPE Violation",
            camera: cameraName,
            zone: "Zone A"
        });
    }
}

// ----------------- DYNAMIC CARDS & TICKER RESPONDERS -----------------

async function loadDashboardStats() {
    const stats = await fetchStats();

    // Compliance rate card update
    const compEl = document.getElementById("val-compliance");
    if (compEl) {
        compEl.textContent = `${stats.complianceRate}%`;
        const card = document.getElementById("card-compliance");
        card.className = "stat-card";
        if (stats.complianceRate >= 90) {
            card.classList.add("compliant");
        } else if (stats.complianceRate >= 80) {
            card.classList.add("warning");
        } else {
            card.classList.add("violation");
        }
    }

    // Unresolved count update (Today)
    const unresEl = document.getElementById("val-unresolved");
    if (unresEl) {
        unresEl.textContent = stats.unresolved_today !== undefined ? stats.unresolved_today : stats.unresolvedViolations;
    }

    // Today alerts update
    const todayEl = document.getElementById("val-today-alerts");
    if (todayEl) {
        todayEl.textContent = stats.activeAlertsToday;
    }
}

// Alerts Sidebar Ticker loader
async function loadAlertsTicker() {
    const ticker = document.getElementById("alerts-ticker");
    if (!ticker) return;

    // Fetch alerts (unacknowledged = active incidents)
    const alerts = await fetchAlerts({ limit: 20 });
    const activeIncidents = alerts.filter(a => !a.acknowledged);

    if (!activeIncidents || activeIncidents.length === 0) {
        ticker.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); padding: 4rem 1.5rem; display: flex; flex-direction: column; align-items: center; gap: 0.5rem;">
                <i data-lucide="shield-check" style="width: 36px; height: 36px; color: var(--color-compliant);"></i>
                <span style="font-weight: 500; color: var(--text-main);">All Systems Compliant</span>
                <p style="font-size: 0.75rem; color: var(--text-muted);">No safety violations logged on active feeds.</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    ticker.innerHTML = "";

    activeIncidents.forEach(item => {
        const card = document.createElement("div");
        card.className = `alert-ticker-card status-${item.acknowledged ? 'acknowledged' : 'unresolved'}`;

        let iconName = "alert-circle";
        if (item.alert_type === "fall") iconName = "user";
        else if (item.message?.includes("Helmet")) iconName = "hard-hat";
        else if (item.message?.includes("Vest")) iconName = "shield-alert";

        // Relative timestamp formatting
        const relativeTime = formatRelativeTime(item.created_at);

        // Get camera name
        const cameraName = item.camera_id ? `CAM-${item.camera_id.substring(0,4)}` : "Unknown";

        card.innerHTML = `
            <div class="alert-ticker-header">
                <div>
                    <span class="status-badge ${item.acknowledged ? 'status-warning' : 'status-violation'}" style="margin-bottom: 0.25rem;">
                        <i data-lucide="${iconName}" style="width: 13px; height: 13px;"></i>
                        ${item.alert_type === "fall" ? "Fall Detected" : "PPE Violation"}
                    </span>
                    <div class="alert-ticker-meta" style="font-weight: 600; color: var(--text-main); font-size: 0.85rem; margin-top: 0.15rem;">
                        ${cameraName}
                    </div>
                </div>
                <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: 500;">
                    ${relativeTime}
                </span>
            </div>

            <div style="font-size: 0.75rem; color: var(--text-muted); display: flex; justify-content: space-between; align-items: center;">
                <span>Zone: ${item.zone || "Zone A"}</span>
            </div>

            <div class="alert-ticker-actions">
                ${!item.acknowledged ? `
                    <button class="btn btn-outline ack-btn" style="flex: 1; padding: 0.3rem 0.5rem; font-size: 0.75rem;">
                        <i data-lucide="eye" style="width: 12px; height: 12px;"></i> Acknowledge
                    </button>
                ` : `
                    <button class="btn btn-outline" disabled style="flex: 1; padding: 0.3rem 0.5rem; font-size: 0.75rem; color: var(--color-warning); border-color: var(--color-warning-border);">
                        <i data-lucide="eye-off" style="width: 12px; height: 12px;"></i> Acknowledged
                    </button>
                `}
                <button class="btn btn-success resolve-btn" style="flex: 1; padding: 0.3rem 0.5rem; font-size: 0.75rem;">
                    <i data-lucide="check" style="width: 12px; height: 12px;"></i> Dismiss
                </button>
            </div>
        `;

        // Action click handlers
        const ackBtn = card.querySelector(".ack-btn");
        if (ackBtn) {
            ackBtn.onclick = async () => {
                ackBtn.disabled = true;
                ackBtn.textContent = "Updating...";
                await acknowledgeAlert(item.id);
                loadAlertsTicker();
                loadDashboardStats();
            };
        }

        const resolveBtn = card.querySelector(".resolve-btn");
        resolveBtn.onclick = async () => {
            resolveBtn.disabled = true;
            resolveBtn.textContent = "Dismissing...";

            // Add slide out animation
            card.style.transform = "translateX(105%)";
            card.style.opacity = "0";
            card.style.transition = "all 0.3s ease-out";

            await updateViolationStatus(item.id, "Resolved");

            setTimeout(() => {
                loadAlertsTicker();
                loadDashboardStats();
                renderTrendsChart();
            }, 300);
        };

        ticker.appendChild(card);
    });

    lucide.createIcons();
}

// Relative times generator
function formatRelativeTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);

    if (diffSecs < 60) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Stacked Bar Chart Trends
async function renderTrendsChart() {
    const trendData = await fetchWeeklyTrends();
    const ctx = document.getElementById('complianceTrendsChart');
    if (!ctx) return;

    if (trendChart) {
        trendChart.destroy();
    }

    trendChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: trendData.labels,
            datasets: [
                {
                    label: 'Violations Detected',
                    data: trendData.violations,
                    backgroundColor: 'rgba(239, 68, 68, 0.75)',
                    borderColor: '#ef4444',
                    borderWidth: 1.5,
                    borderRadius: 4
                },
                {
                    label: 'Compliant Scans',
                    data: trendData.compliant,
                    backgroundColor: 'rgba(16, 185, 129, 0.75)',
                    borderColor: '#10b981',
                    borderWidth: 1.5,
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: '#9ca3af', font: { family: "'Outfit', sans-serif", size: 12 } }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    grid: { color: 'rgba(46, 59, 78, 0.4)' },
                    ticks: { color: '#9ca3af', font: { family: "'Outfit', sans-serif" } }
                },
                y: {
                    stacked: true,
                    grid: { color: 'rgba(46, 59, 78, 0.4)' },
                    ticks: { color: '#9ca3af', precision: 0, font: { family: "'Outfit', sans-serif" } }
                }
            }
        }
    });
}

// ----------------- INITIALIZER -----------------
async function initDashboard() {
    // Populate camera list and rules dynamically from storage
    await populateCameraSelector();
    await updateActiveCameraRules();

    // 1. Initialize live stream immediately so that the CCTV animation starts playing right away
    if (activeCameraId) {
        initLiveStream(activeCameraId);
    }

    // 2. Load stats, ticker feed, and trends in parallel and catch errors gracefully
    try {
        await loadDashboardStats();
    } catch (e) {
        console.error("Dashboard stats load failed: ", e);
    }

    try {
        await loadAlertsTicker();
    } catch (e) {
        console.error("Alerts ticker load failed: ", e);
    }

    try {
        await renderTrendsChart();
    } catch (e) {
        console.error("Trends chart load failed: ", e);
    }

    // 3. Start alerts polling
    startAlertsPolling();

    // 4. Check if redirect warning parameter is present
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("auth_alert") === "admin_only") {
        setTimeout(() => {
            triggerFloatingToast({
                type: "Access Denied",
                camera: "Administrator privileges required to access Settings panel."
            });
            // Clear parameter from URL bar without refreshing
            window.history.replaceState({}, document.title, window.location.pathname);
        }, 300);
    }
}

// Cleanup on page unload
window.addEventListener("beforeunload", () => {
    stopAlertsPolling();
    stopLiveStream();
    stopViolationPolling();
});

document.addEventListener("DOMContentLoaded", initDashboard);