import os
import cv2
import time
import argparse
from dotenv import load_dotenv
from insightface.app import FaceAnalysis
from utils.mongo import faces
from backend_client import confirm_face_registration

load_dotenv()

URL = os.getenv("CAMERA_URL", "http://127.0.0.1:4747/video")
HOLD_TIME = int(os.getenv("REGISTER_HOLD_TIME", "2"))

parser = argparse.ArgumentParser(description="Register student face embedding with OpenCV")
parser.add_argument("--user-id", dest="user_id", default=os.getenv("USER_ID"))
parser.add_argument("--subject-id", dest="subject_id", default=os.getenv("SUBJECT_ID"))
args = parser.parse_args()

USER_ID = args.user_id
SUBJECT_ID = args.subject_id

if not USER_ID or not SUBJECT_ID:
    raise RuntimeError(
        "USER_ID and SUBJECT_ID are required. "
        "Set them in .env or run: python register_face.py --user-id <USER_ID> --subject-id <SUBJECT_ID>"
    )

cap = cv2.VideoCapture(URL)

arc = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
arc.prepare(ctx_id=0, det_size=(640, 640))

start = None
embedding = None

while True:
    ret, frame = cap.read()
    if not ret:
        continue

    faces_detected = arc.get(frame)

    if len(faces_detected) != 1:
        start = None
        cv2.putText(frame, "SHOW ONE FACE", (80, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
    else:
        if start is None:
            start = time.time()

        if time.time() - start >= HOLD_TIME:
            embedding = faces_detected[0].embedding
            break

        cv2.putText(frame, "HOLD...", (150, 220), cv2.FONT_HERSHEY_SIMPLEX, 2, (255, 255, 255), 3)

    cv2.imshow("Register Face", frame)
    if cv2.waitKey(1) == 27:
        break

cap.release()
cv2.destroyAllWindows()

if embedding is None:
    raise RuntimeError("Face capture failed")

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

backend_result = confirm_face_registration(user_id=USER_ID, confidence=0.99)
if not backend_result.get("success"):
    raise RuntimeError(f"Face enrolled locally but backend confirmation failed: {backend_result}")

print("FACE REGISTERED FOR SUBJECT + BACKEND CONFIRMED")
