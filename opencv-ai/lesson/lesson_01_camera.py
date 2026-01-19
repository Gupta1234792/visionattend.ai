import cv2

# Replace with YOUR mobile IP and port
URL = "http://192.168.1.6:4747/video"

cap = cv2.VideoCapture(URL)

if not cap.isOpened():
    print("❌ IP Camera open nahi ho raha")
    exit()

print("✅ Mobile camera connected via IP stream")

while True:
    ret, frame = cap.read()

    if not ret or frame is None:
        print("❌ Frame nahi aa raha")
        continue

    cv2.imshow("Mobile Camera - OpenCV", frame)

    if cv2.waitKey(1) == 27:
        break

cap.release()
cv2.destroyAllWindows()
