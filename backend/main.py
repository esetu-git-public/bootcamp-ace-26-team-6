"""FastAPI backend — PPE Compliance API."""

import base64
from collections import Counter
from datetime import datetime

import cv2
import numpy as np
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from backend.db import select, insert, update
from backend.detector import detect, annotate

app = FastAPI(title="PPE Compliance API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/detect")
async def detect_endpoint(file: UploadFile = File(...)):
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    result = detect(frame)
    annotated = annotate(frame, result["detections"])

    _, buffer = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 85])
    annotated_b64 = base64.b64encode(buffer).decode()

    return {
        **result,
        "annotated_image": annotated_b64,
    }


@app.post("/events")
def create_event(data: dict):
    try:
        ev = insert("detection_events", data)
        return ev[0] if ev else None
    except Exception as e:
        return {"error": str(e)}


@app.get("/events")
def list_events(limit: int = 100, event_type: str | None = None):
    params = {"order": "detected_at.desc", "limit": str(limit)}
    if event_type and event_type != "All":
        params["event_type"] = f"eq.{event_type}"
    return select("detection_events", params) or []


@app.get("/events/{event_id}")
def get_event(event_id: str):
    r = select("detection_events", {"id": f"eq.{event_id}"})
    return r[0] if r else None


@app.post("/cameras")
def create_camera(data: dict):
    try:
        cam = insert("cameras", data)
        return cam[0] if cam else None
    except Exception as e:
        return {"error": str(e)}


@app.get("/stats")
def get_stats():
    events = select("detection_events", {"limit": "1000"}) or []
    total = len(events)
    counts = Counter(e["event_type"] for e in events)

    today = datetime.now().strftime("%Y-%m-%d")
    today_events = [e for e in events if e.get("detected_at", "").startswith(today)]

    return {
        "total": total,
        "compliant": counts.get("compliant", 0),
        "violation": counts.get("violation", 0),
        "fall": counts.get("fall", 0),
        "today": len(today_events),
    }


@app.get("/alerts")
def list_alerts(limit: int = 50):
    return select("alerts", {"order": "created_at.desc", "limit": str(limit)}) or []


@app.patch("/alerts/{alert_id}/ack")
def ack_alert(alert_id: str):
    try:
        r = update("alerts", {"acknowledged": True}, "id", alert_id)
        return r[0] if r else None
    except Exception as e:
        return {"error": str(e)}
