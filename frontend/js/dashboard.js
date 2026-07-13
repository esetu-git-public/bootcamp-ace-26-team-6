// PPE Compliance Detection System - Upgraded Dashboard & Live Monitor Logic

let trendChart = null;
let audioAlarmEnabled = true;
let activeCamera = "CAM-01 Main Gate";
let activeCameraRules = [];
let liveFeedCanvas = null;
let liveFeedCtx = null;
let animationId = null;
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
            <p><strong>${record.type}</strong> detected at <strong>${record.camera}</strong> (${record.site})!</p>
        </div>
        <button class="toast-close-btn">&times;</button>
    `;

    container.appendChild(toast);
    lucide.createIcons();

    // Sound chirp
    playAlarmSound();

    // Flash player hud briefly if active camera matches
    if (record.camera === activeCamera) {
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

// Subscribe to Supabase / Mock DB live inserts
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

// ----------------- LIVE FEED CANVAS GRAPHICS SIMULATOR -----------------
// Dynamic passing worker silhouette generator
let simWorkers = [];

function createPassingWorker(w, h, startX = null, id = null) {
    const walkRight = Math.random() > 0.5;
    const boxW = 80 * (w / 700);
    const boxH = 160 * (h / 450);
    // Spawn off-screen if no startX is provided
    const startPos = startX !== null ? startX : (walkRight ? -boxW - 10 : w + 10);
    
    return {
        id: id || Math.floor(Math.random() * 900 + 100),
        x: startPos,
        y: h * 0.35 + Math.random() * (h * 0.2),
        vx: (walkRight ? 1.0 : -1.0) * (0.7 + Math.random() * 0.6),
        vy: -0.05 + Math.random() * 0.1,
        width: boxW,
        height: boxH,
        name: `Staff #${id || Math.floor(Math.random() * 900 + 100)}`
    };
}

function initLiveCanvas() {
    const player = document.getElementById("video-feed-player");
    if (!player) return;

    let img = document.getElementById("live-feed-img");
    if (!img) {
        img = document.createElement("img");
        img.id = "live-feed-img";
        img.style.position = "absolute";
        img.style.top = "0";
        img.style.left = "0";
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "cover";
        img.style.zIndex = "1";
        player.appendChild(img);
    }

    const canvas = document.getElementById("live-feed-canvas");
    if (canvas) canvas.style.display = "none";

    img.src = "/camera/live";
}

async function renderLiveFrame() {
    if (!liveFeedCtx || !liveFeedCanvas) return;
    
    // Dynamically ensure canvas size matches the player container size
    const player = document.getElementById("video-feed-player");
    if (player && (liveFeedCanvas.width !== player.clientWidth || liveFeedCanvas.height !== player.clientHeight)) {
        liveFeedCanvas.width = player.clientWidth;
        liveFeedCanvas.height = player.clientHeight;
    }
    
    const w = liveFeedCanvas.width;
    const h = liveFeedCanvas.height;
    
    if (w === 0 || h === 0) {
        // Container not laid out yet, defer rendering to next frame
        animationId = requestAnimationFrame(renderLiveFrame);
        return;
    }
    
    try {
        // Clear and draw background CCTV grid lines
        liveFeedCtx.clearRect(0, 0, w, h);
        
        // Style backdrop
        liveFeedCtx.strokeStyle = "rgba(46, 59, 78, 0.25)";
        liveFeedCtx.lineWidth = 1;
        
        // Grid cells
        const gridSize = 40;
        for (let x = 0; x < w; x += gridSize) {
            liveFeedCtx.beginPath();
            liveFeedCtx.moveTo(x, 0);
            liveFeedCtx.lineTo(x, h);
            liveFeedCtx.stroke();
        }
        for (let y = 0; y < h; y += gridSize) {
            liveFeedCtx.beginPath();
            liveFeedCtx.moveTo(0, y);
            liveFeedCtx.lineTo(w, y);
            liveFeedCtx.stroke();
        }

        // Draw CCTV Crosshair center target
        liveFeedCtx.strokeStyle = "rgba(255,255,255,0.15)";
        liveFeedCtx.lineWidth = 2;
        liveFeedCtx.beginPath();
        // Center cross
        liveFeedCtx.moveTo(w/2 - 15, h/2);
        liveFeedCtx.lineTo(w/2 + 15, h/2);
        liveFeedCtx.moveTo(w/2, h/2 - 15);
        liveFeedCtx.lineTo(w/2, h/2 + 15);
        // Corner brackets
        const pad = 20;
        // Top Left
        liveFeedCtx.moveTo(pad, pad + 15); liveFeedCtx.lineTo(pad, pad); liveFeedCtx.lineTo(pad + 15, pad);
        // Top Right
        liveFeedCtx.moveTo(w - pad, pad + 15); liveFeedCtx.lineTo(w - pad, pad); liveFeedCtx.lineTo(w - pad - 15, pad);
        // Bottom Left
        liveFeedCtx.moveTo(pad, h - pad - 15); liveFeedCtx.lineTo(pad, h - pad); liveFeedCtx.lineTo(pad + 15, h - pad);
        // Bottom Right
        liveFeedCtx.moveTo(w - pad, h - pad - 15); liveFeedCtx.lineTo(w - pad, h - pad); liveFeedCtx.lineTo(w - pad - 15, h - pad);
        liveFeedCtx.stroke();

        // Check if there are active unresolved violations on this camera
        let violations = [];
        try {
            violations = JSON.parse(localStorage.getItem("ppe_violations_v2") || "[]");
        } catch (e) {
            console.error("Local storage violations parse error:", e);
        }
        
        const activeCameraViolations = violations.filter(d => 
            d && d.camera === activeCamera && 
            d.type !== "Compliant" && 
            d.status !== "Resolved"
        );

        const hasActiveViolation = activeCameraViolations.length > 0;
        const currentAlert = hasActiveViolation ? activeCameraViolations[0] : null;

        // Move, wrap-around, and draw passing workers
        simWorkers.forEach((worker, idx) => {
            // Move worker
            worker.x += worker.vx;
            worker.y += worker.vy;

            // Handle wrap-around re-spawning
            if (worker.vx > 0 && worker.x > w + 20) {
                simWorkers[idx] = createPassingWorker(w, h, -worker.width, worker.id);
            } else if (worker.vx < 0 && worker.x < -worker.width - 20) {
                simWorkers[idx] = createPassingWorker(w, h, w + 20, worker.id);
            }

            // Read coordinates after possible respawn
            const x = worker.x;
            const y = worker.y;
            const boxW = worker.width;
            const boxH = worker.height;

            let statusColor = "#10b981"; // Green (Compliant default)
            let boxLabel = `${worker.name}: Compliant`;
            
            // 1. Assign the active violation to Worker 1 if one exists
            let isViolator = hasActiveViolation && idx === 1 && currentAlert;
            
            if (isViolator) {
                statusColor = "#ef4444"; // Red
                boxLabel = `ALERT: ${(currentAlert.type || "Violation").toUpperCase()}`;
                
                // Draw blinking red warning border outline
                liveFeedCtx.strokeStyle = "rgba(239, 68, 68, 0.35)";
                liveFeedCtx.lineWidth = 8;
                liveFeedCtx.strokeRect(x, y, boxW, boxH);
            } else {
                // If it is another camera, label it appropriately
                if (activeCamera && activeCamera.includes("Warehouse") && idx === 2) {
                    boxLabel = "Staff: Compliant";
                }
            }

            // Calculate active camera rules and violations for this worker
            const hasHelmetViolation = isViolator && currentAlert.type.includes("Helmet");
            const hasVestViolation = isViolator && currentAlert.type.includes("Vest");
            const hasGlovesViolation = isViolator && currentAlert.type.includes("Gloves");

            const centerX = x + boxW / 2;
            const headR = boxH * 0.055;
            const headY = y + boxH * 0.16;

            // Calculate walking arm/leg swing cycle (Sinusoidal swing based on position x)
            const swing = Math.sin(x * 0.08);

            // 2. Draw Simulated Worker Silhouette (Stick Figure with walking motion)
            liveFeedCtx.strokeStyle = "rgba(255, 255, 255, 0.4)";
            liveFeedCtx.lineWidth = 3.5;
            liveFeedCtx.lineCap = "round";
            liveFeedCtx.beginPath();
            // Head
            liveFeedCtx.arc(centerX, headY, headR, 0, Math.PI * 2);
            // Spine
            liveFeedCtx.moveTo(centerX, headY + headR);
            liveFeedCtx.lineTo(centerX, y + boxH * 0.58);
            // Swinging Arms (left arm moves opposite to right arm)
            liveFeedCtx.moveTo(centerX, y + boxH * 0.28);
            liveFeedCtx.lineTo(centerX - boxW * 0.28, y + boxH * 0.42 + swing * 8);
            liveFeedCtx.moveTo(centerX, y + boxH * 0.28);
            liveFeedCtx.lineTo(centerX + boxW * 0.28, y + boxH * 0.42 - swing * 8);
            // Swinging Legs
            liveFeedCtx.moveTo(centerX, y + boxH * 0.58);
            liveFeedCtx.lineTo(centerX - boxW * 0.24 - swing * 6, y + boxH * 0.9);
            liveFeedCtx.moveTo(centerX, y + boxH * 0.58);
            liveFeedCtx.lineTo(centerX + boxW * 0.24 + swing * 6, y + boxH * 0.9);
            liveFeedCtx.stroke();

            // 3. Draw Safety Vest if active and not missing
            const shouldEnforceVest = activeCameraRules.includes("vest");
            if (shouldEnforceVest && !hasVestViolation) {
                liveFeedCtx.fillStyle = "#f97316"; // Neon safety orange
                liveFeedCtx.beginPath();
                liveFeedCtx.moveTo(centerX - boxW * 0.18, y + boxH * 0.26);
                liveFeedCtx.lineTo(centerX + boxW * 0.18, y + boxH * 0.26);
                liveFeedCtx.lineTo(centerX + boxW * 0.2, y + boxH * 0.52);
                liveFeedCtx.lineTo(centerX - boxW * 0.2, y + boxH * 0.52);
                liveFeedCtx.closePath();
                liveFeedCtx.fill();

                // Draw reflective safety silver stripes on vest
                liveFeedCtx.strokeStyle = "rgba(255, 255, 255, 0.85)";
                liveFeedCtx.lineWidth = 2.5;
                liveFeedCtx.beginPath();
                liveFeedCtx.moveTo(centerX - boxW * 0.08, y + boxH * 0.26);
                liveFeedCtx.lineTo(centerX - boxW * 0.09, y + boxH * 0.52);
                liveFeedCtx.moveTo(centerX + boxW * 0.08, y + boxH * 0.26);
                liveFeedCtx.lineTo(centerX + boxW * 0.09, y + boxH * 0.52);
                liveFeedCtx.moveTo(centerX - boxW * 0.19, y + boxH * 0.39);
                liveFeedCtx.lineTo(centerX + boxW * 0.19, y + boxH * 0.39);
                liveFeedCtx.stroke();
            }

            // 4. Draw Safety Helmet if active and not missing
            const shouldEnforceHelmet = activeCameraRules.includes("helmet");
            if (shouldEnforceHelmet && !hasHelmetViolation) {
                // Helmet dome
                liveFeedCtx.fillStyle = "#fbbf24"; // Safety yellow
                liveFeedCtx.beginPath();
                liveFeedCtx.arc(centerX, headY - headR * 0.35, headR * 1.1, Math.PI, 2 * Math.PI);
                liveFeedCtx.fill();
                // Helmet brim
                liveFeedCtx.strokeStyle = "#fbbf24";
                liveFeedCtx.lineWidth = 2.5;
                liveFeedCtx.beginPath();
                liveFeedCtx.moveTo(centerX - headR * 1.4, headY - headR * 0.35);
                liveFeedCtx.lineTo(centerX + headR * 1.4, headY - headR * 0.35);
                liveFeedCtx.stroke();
            }

            // 5. Draw Safety Gloves if active and not missing
            const shouldEnforceGloves = activeCameraRules.includes("gloves");
            if (shouldEnforceGloves && !hasGlovesViolation) {
                liveFeedCtx.fillStyle = "#10b981"; // Compliant green gloves
                liveFeedCtx.beginPath();
                // Swing gloves along with hands
                liveFeedCtx.arc(centerX - boxW * 0.28, y + boxH * 0.42 + swing * 8, 4.5, 0, Math.PI * 2);
                liveFeedCtx.arc(centerX + boxW * 0.28, y + boxH * 0.42 - swing * 8, 4.5, 0, Math.PI * 2);
                liveFeedCtx.fill();
            }

            // 6. Draw outer bounding box borders
            liveFeedCtx.strokeStyle = statusColor;
            liveFeedCtx.lineWidth = 2.5;
            liveFeedCtx.strokeRect(x, y, boxW, boxH);

            // Draw sub-item detection boxes for YOLO representation
            // Helmet Box
            const helmetX = x + boxW * 0.3;
            const helmetY = y + boxH * 0.05;
            const helmetW = boxW * 0.4;
            const helmetH = boxH * 0.12;
            liveFeedCtx.strokeStyle = hasHelmetViolation ? "#ef4444" : "#10b981";
            liveFeedCtx.lineWidth = 1.25;
            liveFeedCtx.strokeRect(helmetX, helmetY, helmetW, helmetH);
            
            // Vest Box
            const vestX = x + boxW * 0.15;
            const vestY = y + boxH * 0.22;
            const vestW = boxW * 0.7;
            const vestH = boxH * 0.35;
            liveFeedCtx.strokeStyle = hasVestViolation ? "#ef4444" : "#10b981";
            liveFeedCtx.lineWidth = 1.25;
            liveFeedCtx.strokeRect(vestX, vestY, vestW, vestH);

            // Draw Label Banner background
            liveFeedCtx.fillStyle = statusColor;
            const bannerH = 18;
            liveFeedCtx.fillRect(x - 1, y - bannerH, boxW + 2, bannerH);

            // Text
            liveFeedCtx.fillStyle = "#ffffff";
            liveFeedCtx.font = "bold 9px 'Outfit', sans-serif";
            liveFeedCtx.fillText(boxLabel, x + 4, y - 6);
        });
    } catch (err) {
        console.error("Canvas draw frame error caught: ", err);
    }

    animationId = requestAnimationFrame(renderLiveFrame);
}

// Helper: Fetch active camera rules from database
async function updateActiveCameraRules() {
    try {
        const cameras = await getCameras();
        const currentCam = cameras.find(c => c.name === activeCamera);
        if (currentCam) {
            activeCameraRules = currentCam.rules || [];
        } else {
            activeCameraRules = [];
        }
    } catch (e) {
        console.error("Failed to fetch active camera rules:", e);
        activeCameraRules = [];
    }
}

// Helper: Populate camera selector dropdown dynamically from database
async function populateCameraSelector() {
    const selector = document.getElementById("camera-feed-select");
    if (!selector) return;
    
    try {
        const cameras = await getCameras();
        // Filter only Active status cameras
        const activeCams = cameras.filter(c => c.status === "Active");
        
        selector.innerHTML = "";
        activeCams.forEach(cam => {
            const opt = document.createElement("option");
            opt.value = cam.name;
            opt.textContent = cam.name;
            selector.appendChild(opt);
        });
        
        // If activeCamera is not in the active cameras list, set activeCamera to the first active camera
        if (activeCams.length > 0) {
            const stillExists = activeCams.some(c => c.name === activeCamera);
            if (!stillExists) {
                activeCamera = activeCams[0].name;
                const hudCam = document.getElementById("hud-camera-name");
                if (hudCam) hudCam.textContent = activeCamera;
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
        activeCamera = e.target.value;
        
        // Fetch new rules for this camera
        await updateActiveCameraRules();
        
        // Update HUD display labels
        const hudCam = document.getElementById("hud-camera-name");
        if (hudCam) hudCam.textContent = activeCamera;
        
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

    // Unresolved count update
    const unresEl = document.getElementById("val-unresolved");
    if (unresEl) {
        unresEl.textContent = stats.unresolvedViolations;
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

    // Fetch alerts (excluding compliant)
    const { data: logs } = await fetchViolations({
        type: "Violations Only",
        limit: 10,
        sortBy: "created_at",
        sortOrder: "desc"
    });

    // Filter only unresolved or acknowledged alerts
    const activeIncidents = logs.filter(d => d.status !== "Resolved");

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
        card.className = `alert-ticker-card status-${item.status.toLowerCase()}`;
        
        let iconName = "alert-circle";
        if (item.type.includes("Helmet")) iconName = "hard-hat";
        
        // Relative timestamp formatting
        const relativeTime = formatRelativeTime(item.created_at);

        card.innerHTML = `
            <div class="alert-ticker-header">
                <div>
                    <span class="status-badge ${item.status === 'Acknowledged' ? 'status-warning' : 'status-violation'}" style="margin-bottom: 0.25rem;">
                        <i data-lucide="${iconName}" style="width: 13px; height: 13px;"></i>
                        ${item.type}
                    </span>
                    <div class="alert-ticker-meta" style="font-weight: 600; color: var(--text-main); font-size: 0.85rem; margin-top: 0.15rem;">
                        ${item.camera}
                    </div>
                </div>
                <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: 500;">
                    ${relativeTime}
                </span>
            </div>
            
            <div style="font-size: 0.75rem; color: var(--text-muted); display: flex; justify-content: space-between; align-items: center;">
                <span>Location: ${item.site}</span>
                <span>Conf: ${Math.round(item.confidence * 100)}%</span>
            </div>
            
            <div class="alert-ticker-actions">
                ${item.status === 'Unresolved' ? `
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
                await updateViolationStatus(item.id, "Acknowledged");
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

    // 1. Initialize canvas immediately so that the CCTV animation starts playing right away
    initLiveCanvas();
    
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

    // 3. Check if redirect warning parameter is present
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

document.addEventListener("DOMContentLoaded", initDashboard);
