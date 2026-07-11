import cv2

from backend.detector import detect, annotate

# Your IP Webcam stream URL
CAMERA_URL = "http://172.18.59.37:8080/video"

cap = cv2.VideoCapture(CAMERA_URL)

if not cap.isOpened():
    print("Failed to connect to camera")
    exit()

print("✅ Camera Connected")

while True:
    ret, frame = cap.read()

    if not ret:
        print("Failed to read frame")
        break

    # Run YOLO
    result = detect(frame)

    # Print detections
    print("=" * 40)
    print("Event:", result["event_type"])

    for d in result["detections"]:
        print(
            f"{d['class_name']} | "
            f"{d['confidence']:.2f} | "
            f"Violation={d['is_violation']}"
        )

    # Draw bounding boxes
    annotated = annotate(frame, result["detections"])

    cv2.imshow("Live PPE Detection", annotated)

    key = cv2.waitKey(1)

    if key == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()