import threading
import time
import cv2

from backend.config import settings
from backend.detector import detect, annotate


class CameraManager:
    """
    Production-ready camera manager.

    Responsibilities:
    - Connect to Android IP Camera / RTSP Camera
    - Automatically reconnect
    - Run YOLO detection
    - Store latest processed frame
    - Multi-camera ready
    """

    def __init__(self, camera_url=None):
        self.camera_url = camera_url or settings.camera_url

        self.cap = None

        self.running = False

        self.thread = None

        self.latest_frame = None

        self.latest_result = None

        self.lock = threading.Lock()

    

    def connect(self):

        if self.cap is not None:
            self.cap.release()

        self.cap = cv2.VideoCapture(self.camera_url)

        return self.cap.isOpened()


    def start(self):

        if self.running:
            return

        self.running = True

        self.thread = threading.Thread(
            target=self._camera_loop,
            daemon=True
        )

        self.thread.start()

   

    def stop(self):

        self.running = False

        if self.cap is not None:
            self.cap.release()

    

    def _camera_loop(self):

        while self.running:

            if self.cap is None or not self.cap.isOpened():

                print("Connecting to camera...")

                connected = self.connect()

                if not connected:

                    print("Camera unavailable. Retrying in 5 seconds...")

                    time.sleep(5)

                    continue

            success, frame = self.cap.read()

            if not success:

                print("Frame read failed. Reconnecting...")

                self.cap.release()

                self.cap = None

                time.sleep(2)

                continue

            result = detect(frame)

            annotated = annotate(
                frame,
                result["detections"]
            )

            with self.lock:

                self.latest_frame = annotated

                self.latest_result = result

    

    def get_frame(self):

        with self.lock:

            if self.latest_frame is None:
                return None

            return self.latest_frame.copy()

    

    def get_result(self):

        with self.lock:

            return self.latest_result

    

    def get_jpeg(self):

        frame = self.get_frame()

        if frame is None:
            return None

        success, buffer = cv2.imencode(".jpg", frame)

        if not success:
            return None

        return buffer.tobytes()


camera_manager = CameraManager()