from fastapi.responses import StreamingResponse
from backend.camera_manager import camera_manager


def generate_frames():
    while True:

        frame = camera_manager.get_jpeg()

        if frame is None:
            continue

        yield (
            b'--frame\r\n'
            b'Content-Type: image/jpeg\r\n\r\n'
            + frame +
            b'\r\n'
        )


def get_stream():
    return StreamingResponse(
        generate_frames(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )