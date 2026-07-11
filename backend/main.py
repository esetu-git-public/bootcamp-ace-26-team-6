"""FastAPI backend — PPE Compliance API."""

import base64
from collections import Counter
from datetime import datetime

import cv2
import httpx
import numpy as np
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend.auth import get_current_user, router as auth_router
from backend.db import insert, select, update, _raw_delete
from backend.detector import annotate, detect
from backend.camera_manager import camera_manager
from backend.stream import get_stream

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
    stream_url: str


class CameraUpdate(BaseModel):
    name: str | None = None
    stream_url: str | None = None
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


class SettingsUpdate(BaseModel):
    violation_class_ids: list[int] | None = None
    alert_on_violation: bool | None = None
    alert_on_fall: bool | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _get_user_settings(user_id: str) -> dict:
    rows = select("user_settings", {"user_id": f"eq.{user_id}", "limit": "1"})
    return rows[0] if rows else {}


import json
import os

STREAM_FILE = "backend/camera_streams.json"


def _get_stream_urls() -> dict:
    if os.path.exists(STREAM_FILE):
        try:
            with open(STREAM_FILE, "r") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def _save_stream_url(camera_id: str, url: str):
    urls = _get_stream_urls()
    urls[camera_id] = url
    try:
        with open(STREAM_FILE, "w") as f:
            json.dump(urls, f)
    except Exception:
        pass


def _delete_stream_url(camera_id: str):
    urls = _get_stream_urls()
    if camera_id in urls:
        del urls[camera_id]
        try:
            with open(STREAM_FILE, "w") as f:
                json.dump(urls, f)
        except Exception:
            pass



# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@app.get("/health")
def health():
    return {"status": "ok"}
# ---------------------------------------------------------------------------
# Live Camera
# ---------------------------------------------------------------------------

@app.get("/camera/start")
def start_camera():
    camera_manager.start()
    return {
        "status": "Camera Started"
    }


@app.get("/camera/stop")
def stop_camera():
    camera_manager.stop()
    return {
        "status": "Camera Stopped"
    }


@app.get("/camera/status")
def camera_status():

    return {
        "running": camera_manager.running
    }


@app.get("/camera/live")
def live_camera():
    return get_stream()


# ---------------------------------------------------------------------------
# Auth / Me
# ---------------------------------------------------------------------------
@app.get("/auth/me")
def auth_me(user=Depends(get_current_user)):
    rows = select("users", {"id": f"eq.{user.id}", "limit": "1"})
    if not rows:
        raise HTTPException(404, "User not found")
    u = rows[0]
    return {"id": u["id"], "username": u["username"], "created_at": u["created_at"]}


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

    settings = _get_user_settings(user.id)
    vids = settings.get("violation_class_ids")
    violation_ids = set(vids) if vids else None

    result = detect(frame, violation_ids)
    annotated = annotate(frame, result["detections"])

    _, buffer = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 85])
    annotated_b64 = base64.b64encode(buffer).decode()

    return {**result, "annotated_image": annotated_b64}


@app.post("/detect/camera/{camera_id}")
def detect_from_camera(camera_id: str, user=Depends(get_current_user)):
    cams = select("cameras", {"id": f"eq.{camera_id}", "user_id": f"eq.{user.id}"})
    if not cams:
        raise HTTPException(404, "Camera not found")
    cam = cams[0]
    stream_url = cam.get("stream_url") or _get_stream_urls().get(camera_id)
    if not stream_url:
        raise HTTPException(400, "Camera has no stream_url")

    try:
        r = httpx.get(stream_url, timeout=10)
        r.raise_for_status()
        nparr = np.frombuffer(r.content, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if frame is None:
            raise HTTPException(502, "Failed to decode frame from stream_url")
    except httpx.HTTPError:
        raise HTTPException(502, "Failed to fetch frame from camera stream_url")

    settings = _get_user_settings(user.id)
    vids = settings.get("violation_class_ids")
    violation_ids = set(vids) if vids else None

    result = detect(frame, violation_ids)
    annotated = annotate(frame, result["detections"])

    _, buffer = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 85])
    annotated_b64 = base64.b64encode(buffer).decode()

    # Auto-save event
    event_row = {
        "user_id": user.id,
        "camera_id": camera_id,
        "event_type": result["event_type"],
        "snapshot": annotated_b64,
    }
    ev = insert("detection_events", event_row)
    if ev:
        event_id = ev[0]["id"]
        for det in result["detections"]:
            x1, y1, x2, y2 = det["bbox"]
            insert("detections", {
                "event_id": event_id,
                "class_id": det["class_id"],
                "class_name": det["class_name"],
                "confidence": det["confidence"],
                "bbox_x1": x1,
                "bbox_y1": y1,
                "bbox_x2": x2,
                "bbox_y2": y2,
                "is_violation": det["is_violation"],
            })

        alert_violation = settings.get("alert_on_violation", True)
        alert_fall = settings.get("alert_on_fall", True)
        if result["event_type"] == "fall" and alert_fall:
            insert("alerts", {
                "user_id": user.id,
                "camera_id": camera_id,
                "event_id": event_id,
                "alert_type": "fall",
                "message": "Fall detected",
            })
        elif result["event_type"] == "violation" and alert_violation:
            insert("alerts", {
                "user_id": user.id,
                "camera_id": camera_id,
                "event_id": event_id,
                "alert_type": "violation",
                "message": "PPE violation detected",
            })

        return {
            "event_id": event_id,
            "event_type": result["event_type"],
            "annotated_image": annotated_b64,
            "detections": result["detections"],
        }

    return {**result, "annotated_image": annotated_b64}


# ---------------------------------------------------------------------------
# Cameras
# ---------------------------------------------------------------------------
@app.get("/cameras")
def list_cameras(user=Depends(get_current_user)):
    cams = select("cameras", {"user_id": f"eq.{user.id}", "order": "created_at.desc"}) or []
    urls = _get_stream_urls()
    for cam in cams:
        cam["stream_url"] = cam.get("stream_url") or urls.get(cam["id"], "http://localhost:8000/camera/live")
    return cams


@app.post("/cameras")
def create_camera(body: CameraCreate, user=Depends(get_current_user)):
    try:
        cam = insert("cameras", {
            "user_id": user.id,
            "name": body.name,
            # "stream_url" is omitted here to bypass Supabase PGRST204 column not found schema cache error
        })
        if cam:
            camera_id = cam[0]["id"]
            _save_stream_url(camera_id, body.stream_url)
            cam[0]["stream_url"] = body.stream_url
        return cam[0]
    except Exception as e:
        raise HTTPException(400, str(e))


@app.patch("/cameras/{camera_id}")
def update_camera(camera_id: str, body: CameraUpdate, user=Depends(get_current_user)):
    data = body.model_dump(exclude_none=True)
    stream_url = data.pop("stream_url", None)
    if stream_url:
        _save_stream_url(camera_id, stream_url)
        
    if not data:
        # If only stream_url was updated
        cams = select("cameras", {"id": f"eq.{camera_id}"})
        if not cams:
            raise HTTPException(404, "Camera not found")
        cam = cams[0]
        cam["stream_url"] = stream_url
        return cam

    try:
        r = update("cameras", data, "id", camera_id)
        if r:
            r[0]["stream_url"] = stream_url or _get_stream_urls().get(camera_id, "http://localhost:8000/camera/live")
        return r[0] if r else None
    except Exception as e:
        raise HTTPException(400, str(e))


@app.delete("/cameras/{camera_id}")
def delete_camera(camera_id: str, user=Depends(get_current_user)):
    try:
        _raw_delete("cameras", "id", camera_id)
        _delete_stream_url(camera_id)
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

        settings = _get_user_settings(user.id)
        alert_violation = settings.get("alert_on_violation", True)
        alert_fall = settings.get("alert_on_fall", True)

        if body.event_type == "fall" and alert_fall:
            insert("alerts", {
                "user_id": user.id,
                "camera_id": body.camera_id,
                "event_id": event_id,
                "alert_type": "fall",
                "message": "Fall detected",
            })
        elif body.event_type == "violation" and alert_violation:
            insert("alerts", {
                "user_id": user.id,
                "camera_id": body.camera_id,
                "event_id": event_id,
                "alert_type": "violation",
                "message": "PPE violation detected",
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
    event["detections"] = select("detections", {"event_id": f"eq.{event_id}"}) or []
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


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------
@app.get("/settings")
def get_settings(user=Depends(get_current_user)):
    s = _get_user_settings(user.id)
    if not s:
        insert("user_settings", {"user_id": user.id})
        s = _get_user_settings(user.id)
    return {
        "violation_class_ids": s.get("violation_class_ids", [0, 6, 7, 8, 9, 10]),
        "alert_on_violation": s.get("alert_on_violation", True),
        "alert_on_fall": s.get("alert_on_fall", True),
    }


@app.patch("/settings")
def update_settings(body: SettingsUpdate, user=Depends(get_current_user)):
    existing = _get_user_settings(user.id)
    if not existing:
        insert("user_settings", {"user_id": user.id})

    data = body.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(400, "No fields to update")
    try:
        r = update("user_settings", data, "user_id", user.id)
        return r[0] if r else None
    except Exception as e:
        raise HTTPException(400, str(e))


# Mount static files for frontend to serve them from '/'
app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")

