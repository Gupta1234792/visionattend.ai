import os
import cv2
import numpy as np
from dotenv import load_dotenv
from insightface.app import FaceAnalysis
from utils.mongo import faces
from utils.liveness import motion_score
from backend_client import mark_face_attendance

load_dotenv()

URL = os.getenv("CAMERA_URL", "http://127.0.0.1:4747/video")
SUBJECT_ID = os.getenv("SUBJECT_ID")

MATCH_THRESHOLD = float(os.getenv("MATCH_THRESHOLD", "0.65"))
LIVENESS_THRESHOLD = float(os.getenv("LIVENESS_THRESHOLD", "1.5"))
LIVENESS_SIZE = (160, 160)

FONT = cv2.FONT_HERSHEY_SIMPLEX

if not SUBJECT_ID:
    raise RuntimeError("SUBJECT_ID is required in environment")

arc = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
arc.prepare(ctx_id=0, det_size=(640, 640))

cap = cv2.VideoCapture(URL)


def cosine(a, b):
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))


db_faces = list(faces.find({"subjectId": SUBJECT_ID}))
print("Loaded enrolled faces:", len(db_faces))

if not db_faces:
    raise RuntimeError("No enrolled faces found for this subject")

attendance_sent = False

while True:
    ret, frame = cap.read()
    if not ret:
        continue

    detections = arc.get(frame)

    if len(detections) != 1:
        cv2.putText(frame, "SHOW ONE FACE", (40, 60), FONT, 1.2, (0, 255, 255), 2)
        cv2.imshow("Verify", frame)
        if cv2.waitKey(1) == 27:
            break
        continue

    face = detections[0]
    emb = face.embedding

    x1, y1, x2, y2 = map(int, face.bbox)
    cv2.rectangle(frame, (x1, y1), (x2, y2), (255, 255, 255), 2)

    face_crop = frame[y1:y2, x1:x2]
    if face_crop.size == 0:
        continue

    face_crop = cv2.resize(face_crop, LIVENESS_SIZE)
    live_score = motion_score(face_crop)

    if live_score < LIVENESS_THRESHOLD:
        cv2.putText(frame, "SPOOF DETECTED", (40, 200), FONT, 1.5, (0, 0, 255), 3)
        cv2.imshow("Verify", frame)
        if cv2.waitKey(1) == 27:
            break
        continue

    best_score = 0.0
    best_user_id = None

    for doc in db_faces:
        db_emb = np.array(doc["embedding"])
        score = cosine(emb, db_emb)
        if score > best_score:
            best_score = score
            best_user_id = doc["userId"]

    print(f"Best cosine score: {best_score:.3f}")

    if best_score >= MATCH_THRESHOLD and best_user_id:
        cv2.putText(frame, "MATCH CONFIRMED", (40, 120), FONT, 1.2, (0, 255, 0), 3)

        if not attendance_sent:
            res = mark_face_attendance(
                user_id=best_user_id,
                subject_id=SUBJECT_ID,
                confidence=float(best_score)
            )

            print("Backend:", res)

            if res.get("success"):
                cv2.putText(frame, "ATTENDANCE MARKED", (40, 200), FONT, 1.6, (0, 255, 0), 4)
                cv2.imshow("Verify", frame)
                cv2.waitKey(1500)
                attendance_sent = True
                break
            else:
                cv2.putText(frame, "BACKEND REJECTED", (40, 200), FONT, 1.4, (0, 0, 255), 3)
    else:
        cv2.putText(frame, f"NO MATCH {best_score:.2f}", (40, 120), FONT, 1.2, (0, 0, 255), 3)

    cv2.imshow("Verify", frame)
    if cv2.waitKey(1) == 27:
        break

cap.release()
cv2.destroyAllWindows()
