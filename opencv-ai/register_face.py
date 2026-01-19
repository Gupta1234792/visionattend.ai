import cv2, time, numpy as np
import mediapipe as mp
from insightface.app import FaceAnalysis
from utils.mongo import faces
from utils.liveness import eye_blink, head_pose

URL = "http://192.168.1.6:4747/video"
USER_ID = "PASTE_BACKEND_USER_ID_HERE"

cap = cv2.VideoCapture(URL)

mp_mesh = mp.solutions.face_mesh.FaceMesh(
    refine_landmarks=True,
    max_num_faces=1
)

arc = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
arc.prepare(ctx_id=0)

steps = ["FRONT", "LEFT", "RIGHT", "UP", "BLINK"]
current = 0
embeddings = []
prev_blink = 0.03
countdown = None

while True:
    ret, frame = cap.read()
    if not ret:
        continue

    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    res = mp_mesh.process(rgb)

    if not res.multi_face_landmarks:
        cv2.imshow("Register", frame)
        if cv2.waitKey(1) == 27: break
        continue

    landmarks = res.multi_face_landmarks[0].landmark
    step = steps[current]

    cv2.putText(frame, f"STEP: {step}", (30,40),
                cv2.FONT_HERSHEY_SIMPLEX,1,(0,255,255),2)

    if countdown is None:
        countdown = time.time()

    if time.time() - countdown < 2:
        cv2.putText(frame,"HOLD...",(200,200),
                    cv2.FONT_HERSHEY_SIMPLEX,2,(255,255,255),3)
    else:
        face = arc.get(frame)
        if len(face) == 1:
            if step == "BLINK":
                d = eye_blink(landmarks)
                if d < 0.01 and prev_blink > 0.02:
                    current += 1
                prev_blink = d
            else:
                if head_pose(landmarks) == step:
                    embeddings.append(face[0].embedding)
                    current += 1
        countdown = None

    if current >= len(steps):
        final_emb = np.mean(embeddings, axis=0)

        faces.insert_one({
            "userId": USER_ID,
            "embedding": final_emb.tolist(),
            "model": "arcface_buffalo_l",
            "dim": 512
        })

        print("✅ FACE REGISTERED FOR USER:", USER_ID)
        break

    cv2.imshow("Register", frame)
    if cv2.waitKey(1) == 27:
        break

cap.release()
cv2.destroyAllWindows()
