import cv2
import httpx
import numpy as np
from fastapi.responses import StreamingResponse

from backend.detector import annotate, detect


def generate_frames(stream_url: str, violation_ids: set | None = None):
    if stream_url.startswith("rtsp://"):
        cap = cv2.VideoCapture(stream_url)
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            result = detect(frame, violation_ids)
            annotated = annotate(frame, result["detections"])
            _, buffer = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 85])
            yield (b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
        cap.release()
    else:
        while True:
            try:
                r = httpx.get(stream_url, timeout=5)
                nparr = np.frombuffer(r.content, np.uint8)
                frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                if frame is None:
                    continue
                result = detect(frame, violation_ids)
                annotated = annotate(frame, result["detections"])
                _, buffer = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 85])
                yield (b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
            except Exception:
                continue


def camera_stream_response(stream_url: str, violation_ids: set | None = None):
    return StreamingResponse(
        generate_frames(stream_url, violation_ids),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )
