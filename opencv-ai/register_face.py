import cv2
import time
from insightface.app import FaceAnalysis
from utils.mongo import faces

# ================= CONFIG =================
URL = "http://192.168.1.6:4747/video"
USER_ID = "69760b44ab7d2cc07bf2f576"      # Mongo User _id (student)
SUBJECT_ID = "697a5c786f7ee67f47600435"   # Mongo Subject _id
HOLD_TIME = 2

# ================= INIT =================
cap = cv2.VideoCapture(URL)

arc = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
arc.prepare(ctx_id=0, det_size=(640, 640))

start = None
embedding = None

# ================= CAPTURE =================
while True:
    ret, frame = cap.read()
    if not ret:
        continue

    faces_detected = arc.get(frame)

    if len(faces_detected) != 1:
        start = None
        cv2.putText(frame, "SHOW ONE FACE", (80, 50),
                    cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
    else:
        if start is None:
            start = time.time()

        if time.time() - start >= HOLD_TIME:
            embedding = faces_detected[0].embedding
            break

        cv2.putText(frame, "HOLD...", (150, 220),
                    cv2.FONT_HERSHEY_SIMPLEX, 2, (255, 255, 255), 3)

    cv2.imshow("Register Face", frame)
    if cv2.waitKey(1) == 27:
        break

cap.release()
cv2.destroyAllWindows()

# ================= SAVE =================
if embedding is None:
    raise RuntimeError("❌ Face capture failed")

# 🔒 ensure ONE face per user per subject
faces.delete_many({
    "userId": USER_ID,
    "subjectId": SUBJECT_ID
})

faces.insert_one({
    "userId": USER_ID,
    "subjectId": SUBJECT_ID,
    "embedding": embedding.tolist(),
    "model": "arcface_buffalo_l",
    "dim": 512,
    "createdAt": time.time()
})

print("✅ FACE REGISTERED FOR SUBJECT")
