import cv2, numpy as np
from insightface.app import FaceAnalysis
from utils.mongo import faces
from utils.liveness import motion_score
from backend_client import mark_face_attendance

URL = "http://192.168.1.6:4747/video"
THRESHOLD = 0.35
SUBJECT_ID = "696f5dbd27437c0fdca1433b"

data = list(faces.find())
db_emb = np.array(data[0]["embedding"])
matched_user_id = data[0]["studentId"]

arc = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
arc.prepare(ctx_id=0)

cap = cv2.VideoCapture(URL)
scores = []

sent = False

while True:
    ret, frame = cap.read()
    if not ret:
        continue

    motion = motion_score(frame)
    if motion < 1.5:
        cv2.putText(frame, "SPOOF", (200,200),
                    cv2.FONT_HERSHEY_SIMPLEX,2,(0,0,255),3)
        cv2.imshow("Verify", frame)
        if cv2.waitKey(1) == 27: break
        continue

    faces_det = arc.get(frame)
    if len(faces_det) == 1:
        emb = faces_det[0].embedding
        score = np.dot(emb, db_emb) / (np.linalg.norm(emb) * np.linalg.norm(db_emb))
        scores.append(score)
        scores = scores[-10:]

        if len(scores) == 10 and np.mean(scores) > THRESHOLD and not sent:
            confidence = float(np.mean(scores))

            result = mark_face_attendance(
                user_id=matched_user_id,
                subject_id=SUBJECT_ID,
                confidence=confidence
            )

            print("📡 Backend response:", result)
            sent = True

            cv2.putText(frame, "ATTENDANCE MARKED ✓", (50,200),
                        cv2.FONT_HERSHEY_SIMPLEX,2,(0,255,0),3)

    cv2.imshow("Verify", frame)
    if cv2.waitKey(1) == 27:
        break

cap.release()
cv2.destroyAllWindows()
