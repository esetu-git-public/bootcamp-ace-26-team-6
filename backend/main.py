"""FastAPI backend — PPE Compliance API."""

import base64
from collections import Counter
from datetime import datetime

import cv2
import numpy as np
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.auth import get_current_user, router as auth_router
from backend.db import insert, select, update
from backend.detector import annotate, detect

app = FastAPI(title="PPE Compliance API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class CameraCreate(BaseModel):
    name: str


class CameraUpdate(BaseModel):
    name: str | None = None
    is_active: bool | None = None


class DetectionCreate(BaseModel):
    class_id: int
    class_name: str
    confidence: float
    bbox: list[float]
    is_violation: bool


class EventCreate(BaseModel):
    camera_id: str | None = None
    event_type: str
    snapshot: str | None = None
    detections: list[DetectionCreate] = []


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@app.get("/health")
def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Detect
# ---------------------------------------------------------------------------
@app.post("/detect")
async def detect_endpoint(
    file: UploadFile = File(...),
    user=Depends(get_current_user),
):
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    result = detect(frame)
    annotated = annotate(frame, result["detections"])

    _, buffer = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 85])
    annotated_b64 = base64.b64encode(buffer).decode()

    return {**result, "annotated_image": annotated_b64}


# ---------------------------------------------------------------------------
# Cameras
# ---------------------------------------------------------------------------
@app.get("/cameras")
def list_cameras(user=Depends(get_current_user)):
    return select("cameras", {"user_id": f"eq.{user.id}", "order": "created_at.desc"}) or []


@app.post("/cameras")
def create_camera(body: CameraCreate, user=Depends(get_current_user)):
    try:
        cam = insert("cameras", {"user_id": user.id, "name": body.name})
        return cam[0]
    except Exception as e:
        raise HTTPException(400, str(e))


@app.patch("/cameras/{camera_id}")
def update_camera(camera_id: str, body: CameraUpdate, user=Depends(get_current_user)):
    data = body.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(400, "No fields to update")
    try:
        r = update("cameras", data, "id", camera_id)
        return r[0] if r else None
    except Exception as e:
        raise HTTPException(400, str(e))


@app.delete("/cameras/{camera_id}")
def delete_camera(camera_id: str, user=Depends(get_current_user)):
    from backend.db import _raw_delete

    try:
        _raw_delete("cameras", "id", camera_id)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(400, str(e))


# ---------------------------------------------------------------------------
# Events
# ---------------------------------------------------------------------------
@app.post("/events")
def create_event(body: EventCreate, user=Depends(get_current_user)):
    try:
        event_row = {
            "user_id": user.id,
            "camera_id": body.camera_id,
            "event_type": body.event_type,
            "snapshot": body.snapshot,
        }
        ev = insert("detection_events", event_row)
        if not ev:
            raise HTTPException(500, "Failed to create event")
        event = ev[0]
        event_id = event["id"]

        for det in body.detections:
            x1, y1, x2, y2 = det.bbox
            insert("detections", {
                "event_id": event_id,
                "class_id": det.class_id,
                "class_name": det.class_name,
                "confidence": det.confidence,
                "bbox_x1": x1,
                "bbox_y1": y1,
                "bbox_x2": x2,
                "bbox_y2": y2,
                "is_violation": det.is_violation,
            })

        if body.event_type in ("violation", "fall"):
            insert("alerts", {
                "user_id": user.id,
                "camera_id": body.camera_id,
                "event_id": event_id,
                "alert_type": body.event_type,
                "message": f"{body.event_type} detected",
            })

        return event
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, str(e))


@app.get("/events")
def list_events(
    limit: int = 100,
    event_type: str | None = None,
    user=Depends(get_current_user),
):
    params = {"user_id": f"eq.{user.id}", "order": "detected_at.desc", "limit": str(limit)}
    if event_type and event_type != "All":
        params["event_type"] = f"eq.{event_type}"
    return select("detection_events", params) or []


@app.get("/events/{event_id}")
def get_event(event_id: str, user=Depends(get_current_user)):
    r = select("detection_events", {"id": f"eq.{event_id}", "user_id": f"eq.{user.id}"})
    if not r:
        raise HTTPException(404, "Event not found")
    event = r[0]
    event["detections"] = (
        select("detections", {"event_id": f"eq.{event_id}"}) or []
    )
    return event


# ---------------------------------------------------------------------------
# Detections
# ---------------------------------------------------------------------------
@app.get("/detections")
def list_detections(limit: int = 50, user=Depends(get_current_user)):
    dets = select("detections", {"order": "id.desc", "limit": str(limit)}) or []
    event_ids = list({d["event_id"] for d in dets})
    if not event_ids:
        return []

    events = {}
    for eid in event_ids:
        ev = select("detection_events", {"id": f"eq.{eid}", "user_id": f"eq.{user.id}"})
        if ev:
            events[eid] = ev[0]

    result = []
    for d in dets:
        ev = events.get(d["event_id"])
        if ev:
            result.append({**d, "snapshot": ev.get("snapshot"), "event_type": ev["event_type"]})
    return result[:limit]


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------
@app.get("/stats")
def get_stats(user=Depends(get_current_user)):
    events = select("detection_events", {"user_id": f"eq.{user.id}", "limit": "1000"}) or []
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


# ---------------------------------------------------------------------------
# Alerts
# ---------------------------------------------------------------------------
@app.get("/alerts")
def list_alerts(limit: int = 50, user=Depends(get_current_user)):
    return select("alerts", {"user_id": f"eq.{user.id}", "order": "created_at.desc", "limit": str(limit)}) or []


@app.patch("/alerts/{alert_id}/ack")
def ack_alert(alert_id: str, user=Depends(get_current_user)):
    try:
        r = update("alerts", {"acknowledged": True}, "id", alert_id)
        if not r:
            raise HTTPException(404, "Alert not found")
        return r[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, str(e))
