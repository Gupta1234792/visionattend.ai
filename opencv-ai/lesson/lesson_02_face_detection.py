import cv2

# Mobile IP stream (apna IP daalo)
URL = "http://192.168.1.6:4747/video"

cap = cv2.VideoCapture(URL)

if not cap.isOpened():
    print("❌ Camera open nahi ho raha")
    exit()

# Load Haarcascade
face_cascade = cv2.CascadeClassifier(
    "haarcascades/haarcascade_frontalface_default.xml"
)

if face_cascade.empty():
    print("❌ Haarcascade file load nahi hui")
    exit()

print("✅ Face detection started")

while True:
    ret, frame = cap.read()
    if not ret:
        continue

    # Convert to grayscale (IMPORTANT)
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

    # Detect faces
    faces = face_cascade.detectMultiScale(
        gray,
        scaleFactor=1.3,
        minNeighbors=5
    )

    # Draw box
    for (x, y, w, h) in faces:
        cv2.rectangle(
            frame,
            (x, y),
            (x + w, y + h),
            (0, 255, 0),
            2
        )

    cv2.imshow("Face Detection - OpenCV", frame)

    if cv2.waitKey(1) == 27:
        break

cap.release()
cv2.destroyAllWindows()
