import cv2
import time
from insightface.app import FaceAnalysis
from utils.mongo import faces

# ================= CONFIG =================
URL = "http://192.168.1.6:4747/video"
USER_ID = "69760b44ab7d2cc07bf2f576"      # student id
SUBJECT_ID = "69760a3aab7d2cc07bf2f565"   # subject id
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

    det = arc.get(frame)

    if len(det) != 1:
        start = None
        cv2.putText(frame, "SHOW FACE", (100, 50),
                    cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
    else:
        if start is None:
            start = time.time()

        if time.time() - start >= HOLD_TIME:
            embedding = det[0].embedding
            break

        cv2.putText(frame, "HOLD...", (150, 220),
                    cv2.FONT_HERSHEY_SIMPLEX, 2, (255, 255, 255), 3)

    cv2.imshow("Register Face", frame)
    if cv2.waitKey(1) == 27:
        break

cap.release()
cv2.destroyAllWindows()

# ================= SAVE =================
if embedding is not None:
    faces.delete_many({
        "userId": USER_ID,
        "subjectId": SUBJECT_ID
    })

    faces.insert_one({
        "userId": USER_ID,
        "subjectId": SUBJECT_ID,
        "embedding": embedding.tolist(),
        "model": "arcface_buffalo_l",
        "dim": 512
    })

    print("✅ FACE REGISTERED WITH SUBJECT")
else:
    print("❌ FACE REGISTRATION FAILED")
