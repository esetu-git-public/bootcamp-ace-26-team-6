import logging
import cv2
import httpx
import numpy as np
from fastapi.responses import StreamingResponse

from backend.detector import annotate, detect

logger = logging.getLogger(__name__)


def generate_frames(stream_url: str, violation_ids: set | None = None):
    if stream_url.startswith("rtsp://"):
        cap = cv2.VideoCapture(stream_url)
        if not cap.isOpened():
            logger.error(f"Failed to open RTSP stream: {stream_url}")
            return
        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    logger.warning(f"Failed to read frame from RTSP: {stream_url}")
                    break
                try:
                    result = detect(frame, violation_ids)
                    annotated = annotate(frame, result["detections"])
                    _, buffer = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 85])
                    yield (b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
                except Exception as e:
                    logger.exception(f"Detection error on frame: {e}")
                    continue
        finally:
            cap.release()
            logger.info(f"Released RTSP capture: {stream_url}")
    else:
        while True:
            try:
                r = httpx.get(stream_url, timeout=5)
                r.raise_for_status()
                nparr = np.frombuffer(r.content, np.uint8)
                frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                if frame is None:
                    continue
                result = detect(frame, violation_ids)
                annotated = annotate(frame, result["detections"])
                _, buffer = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 85])
                yield (b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
            except httpx.RequestError as e:
                logger.warning(f"HTTP error fetching {stream_url}: {e}")
                continue
            except Exception as e:
                logger.exception(f"Unexpected error in HTTP stream: {e}")
                continue


def camera_stream_response(stream_url: str, violation_ids: set | None = None):
    return StreamingResponse(
        generate_frames(stream_url, violation_ids),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )