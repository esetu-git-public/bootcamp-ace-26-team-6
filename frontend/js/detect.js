// PPE Compliance Detection System - Connected Scan & Detect Logic

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");
const viewerContainer = document.getElementById("viewer-container");
const previewImage = document.getElementById("preview-image");
const canvas = document.getElementById("detection-canvas");
const detectBtn = document.getElementById("detect-btn");
const resetBtn = document.getElementById("reset-btn");
const resultsCard = document.getElementById("results-card");
const zoneSelect = document.getElementById("zone-select");

const resultsSummary = document.getElementById("results-summary");
const summaryIcon = document.getElementById("summary-icon");
const summaryTitle = document.getElementById("summary-title");
const summarySubtitle = document.getElementById("summary-subtitle");
const detectedItemsList = document.getElementById("detected-items-list");
const logStatusMessage = document.getElementById("log-status-message");

// Handle Dropzone actions
dropzone.addEventListener("click", () => fileInput.click());

dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
});

["dragleave", "dragend"].forEach(type => {
    dropzone.addEventListener(type, () => {
        dropzone.classList.remove("dragover");
    });
});

dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer.files.length) {
        handleFile(e.dataTransfer.files[0]);
    }
});

fileInput.addEventListener("change", (e) => {
    if (e.target.files.length) {
        handleFile(e.target.files[0]);
    }
});

// Handle URL Image Loader
document.getElementById("load-url-btn").addEventListener("click", async (e) => {
    e.preventDefault();
    const urlInput = document.getElementById("image-url-input");
    const url = urlInput.value.trim();
    if (!url) {
        alert("Please enter a valid image URL.");
        return;
    }
    
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
        const blob = await res.blob();
        
        const filename = url.substring(url.lastIndexOf('/') + 1) || "downloaded_image.png";
        const file = new File([blob], filename, { type: blob.type });
        
        const dt = new DataTransfer();
        dt.items.add(file);
        fileInput.files = dt.files;
        
        handleFile(file);
    } catch (err) {
        console.error("Failed to load image from URL:", err);
        alert("Failed to load image from URL: " + err.message);
    }
});

function handleFile(file) {
    if (!file.type.startsWith("image/")) {
        alert("Please upload an image file (JPG, PNG).");
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        previewImage.src = e.target.result;
        
        previewImage.onload = () => {
            dropzone.style.display = "none";
            viewerContainer.style.display = "flex";
            detectBtn.removeAttribute("disabled");
            resetBtn.style.display = "block";
            
            clearCanvas();
        };
    };
    reader.readAsDataURL(file);
}

// Reset scan utility
resetBtn.addEventListener("click", () => {
    viewerContainer.style.display = "none";
    previewImage.src = "";
    fileInput.value = "";
    
    dropzone.style.display = "flex";
    detectBtn.setAttribute("disabled", "true");
    resetBtn.style.display = "none";
    resultsCard.classList.remove("visible");
    
    clearCanvas();
});

function clearCanvas() {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function resizeCanvas() {
    if (viewerContainer.style.display === "none") return;
    canvas.width = previewImage.clientWidth;
    canvas.height = previewImage.clientHeight;
}

window.addEventListener("resize", () => {
    resizeCanvas();
});

// Run Detection handler (FastAPI Connection)
detectBtn.addEventListener("click", async () => {
    const file = fileInput.files[0];
    if (!file) {
        alert("Please upload an image file first.");
        return;
    }

    const selectedZone = zoneSelect.value;

    // Show loading state
    detectBtn.setAttribute("disabled", "true");
    const originalText = detectBtn.innerHTML;
    detectBtn.innerHTML = `<span class="spinner" style="width: 16px; height: 16px; border-width: 2px; margin-right: 0.5rem; display: inline-block; vertical-align: middle;"></span> Analyzing...`;

    resultsCard.classList.remove("visible");
    clearCanvas();

    const formData = new FormData();
    formData.append("file", file);

    try {
        const session = getCurrentSession();
        const token = session ? session.access_token : null;

        const response = await fetch("/detect", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`
            },
            body: formData
        });

        if (!response.ok) {
            throw new Error(`Server returned status code: ${response.status}`);
        }

        const result = await response.json();

        // Display the YOLO annotated image directly returned by FastAPI
        previewImage.onload = null; // Prevent recursion loops
        previewImage.src = `data:image/jpeg;base64,${result.annotated_image}`;
        
        resizeCanvas();

        // Process report results
        await processDetectionReport(result, selectedZone);

    } catch (error) {
        console.error("YOLO detection execution error:", error);
        alert("Failed to run detection: " + error.message);
    } finally {
        detectBtn.removeAttribute("disabled");
        detectBtn.innerHTML = originalText;
    }
});

async function processDetectionReport(result, zone) {
    const isCompliant = result.event_type === "compliant";
    
    // Average confidence calculation
    const avgConfidence = result.detections.length > 0 
        ? parseFloat((result.detections.reduce((acc, curr) => acc + curr.confidence, 0) / result.detections.length).toFixed(2)) 
        : 0.95;

    // Log the event to database via frontend adapter
    const newViolation = {
        type: isCompliant ? "Compliant" : (result.event_type === "fall" ? "Fall-Detected" : "PPE Violation"),
        site: "Site Alpha",
        camera: "Upload Scan",
        worker_area: zone,
        confidence: avgConfidence,
        image_url: result.annotated_image,
        details: {
            scenario: "uploaded-image",
            items_found: result.detections.map(d => ({
                name: d.class_name,
                status: d.is_violation ? "violation" : "compliant",
                confidence: d.confidence
            }))
        }
    };

    const savedRecord = await addViolation(newViolation);

    // Results UI configuration
    resultsCard.classList.add("visible");
    resultsSummary.className = "results-summary " + (isCompliant ? "compliant" : "violation");

    if (isCompliant) {
        summaryIcon.setAttribute("data-lucide", "shield-check");
        summaryTitle.textContent = "Compliance Pass";
        summaryTitle.style.color = "var(--color-compliant)";
        summarySubtitle.textContent = `All PPE detected (Confidence: ${Math.round(avgConfidence * 100)}%)`;
    } else {
        summaryIcon.setAttribute("data-lucide", "shield-alert");
        summaryTitle.textContent = "PPE Violation Alert";
        summaryTitle.style.color = "var(--color-violation)";
        summarySubtitle.textContent = `${newViolation.type} detected in ${zone}`;
    }

    // Render detected objects
    detectedItemsList.innerHTML = "";
    if (result.detections.length === 0) {
        detectedItemsList.innerHTML = `<div style="text-align: center; color: var(--text-muted); width: 100%; padding: 1rem 0;">No safety items detected.</div>`;
    } else {
        result.detections.forEach(item => {
            const div = document.createElement("div");
            div.className = `detected-item ${item.is_violation ? 'violation' : 'compliant'}`;
            
            let statusIcon = item.is_violation ? 'alert-triangle' : 'check';
            if (item.class_name === "Person") statusIcon = "user";
            
            div.innerHTML = `
                <div class="detected-item-name">
                    <i data-lucide="${statusIcon}" style="width: 16px; height: 16px; color: ${item.is_violation ? 'var(--color-violation)' : (item.class_name === 'Person' ? 'var(--color-primary)' : 'var(--color-compliant)')}"></i>
                    <span>${item.class_name}</span>
                </div>
                <span class="detected-item-confidence">${Math.round(item.confidence * 100)}%</span>
            `;
            detectedItemsList.appendChild(div);
        });
    }

    // Display storage logging info
    logStatusMessage.innerHTML = `
        <i data-lucide="database" style="width: 14px; height: 14px; color: var(--color-compliant);"></i>
        <span>Logged in Supabase (Event ID: #${savedRecord.id})</span>
    `;

    lucide.createIcons();
}
