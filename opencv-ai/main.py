import cv2
import numpy as np
import time
import mediapipe as mp
from insightface.app import FaceAnalysis

from utils.mongo import faces as faces_col


# ================= CONFIG =================
URL = "http://192.168.1.6:4747/video"
MATCH_THRESHOLD = 0.42
REGISTER_COOLDOWN = 5
# =========================================


# ---------- COLORS ----------
GREEN  = (0, 220, 120)
YELLOW = (0, 255, 255)
ORANGE = (0, 165, 255)
BLACK  = (0, 0, 0)


# ---------- MediaPipe ----------
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    static_image_mode=False,
    refine_landmarks=True,
    max_num_faces=1
)


# ---------- ArcFace ----------
arcface = FaceAnalysis(
    name="buffalo_l",
    providers=["CPUExecutionProvider"]
)
arcface.prepare(ctx_id=0, det_size=(640, 640))


# ---------- Camera ----------
cap = cv2.VideoCapture(URL)


# ---------- UI ----------
def draw_banner(frame, text, color):
    h, w = frame.shape[:2]
    overlay = frame.copy()

    cv2.rectangle(overlay, (0, h - 110), (w, h), BLACK, -1)
    cv2.addWeighted(overlay, 0.6, frame, 0.4, 0, frame)

    cv2.putText(
        frame,
        text,
        (30, h - 40),
        cv2.FONT_HERSHEY_SIMPLEX,
        1.3,
        color,
        3
    )


# ---------- Cosine Similarity ----------
def cosine(a, b):
    na = np.linalg.norm(a)
    nb = np.linalg.norm(b)

    if na == 0 or nb == 0:
        return 0

    return float(np.dot(a, b) / (na * nb))


# ---------- Find Match ----------
def find_match(embedding):

    users = list(faces_col.find())

    if not users:
        return None, 0

    best_user = None
    best_score = 0

    for user in users:

        if "embedding" not in user:
            continue

        db_emb = np.array(user["embedding"])

        score = cosine(embedding, db_emb)

        if score > best_score:
            best_score = score
            best_user = user

    if best_score >= MATCH_THRESHOLD:
        return best_user, best_score

    return None, best_score


print("🎥 VisionAttend running...")


last_register = 0


# ================= MAIN LOOP =================
while True:

    ret, frame = cap.read()

    if not ret:
        print("⚠ Camera reconnecting...")
        cap.release()
        time.sleep(1)
        cap = cv2.VideoCapture(URL)
        continue

    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

    mp_result = face_mesh.process(rgb)

    if not mp_result.multi_face_landmarks:

        draw_banner(frame, "NO FACE DETECTED", ORANGE)

        cv2.imshow("VisionAttend", frame)

        if cv2.waitKey(1) == 27:
            break

        continue


    faces = arcface.get(frame)

    if not faces:
        draw_banner(frame, "FACE NOT CLEAR", ORANGE)
        cv2.imshow("VisionAttend", frame)

        if cv2.waitKey(1) == 27:
            break

        continue


    if len(faces) != 1:

        draw_banner(frame, "ONLY ONE FACE ALLOWED", ORANGE)

        cv2.imshow("VisionAttend", frame)

        if cv2.waitKey(1) == 27:
            break

        continue


    face = faces[0]

    emb = face.embedding

    x1, y1, x2, y2 = map(int, face.bbox)

    x1 = max(0, x1)
    y1 = max(0, y1)


    cv2.rectangle(frame, (x1, y1), (x2, y2), GREEN, 2)


    # ---------- MATCH ----------
    user, score = find_match(emb)


    if user:

        draw_banner(
            frame,
            f"ALREADY REGISTERED ✓ | ID: {user['studentId']}",
            GREEN
        )

    else:

        now = time.time()

        if now - last_register > REGISTER_COOLDOWN:

            new_id = f"student_{int(now)}"

            faces_col.insert_one({
                "studentId": new_id,
                "embedding": emb.tolist(),
                "model": "arcface_buffalo_l",
                "dim": 512,
                "createdAt": now
            })

            last_register = now

            draw_banner(
                frame,
                f"FACE REGISTERED ✓ | ID: {new_id}",
                YELLOW
            )

        else:

            draw_banner(frame, "PROCESSING...", YELLOW)


    cv2.imshow("VisionAttend", frame)

    if cv2.waitKey(1) == 27:
        break


# ================= CLEANUP =================
cap.release()
cv2.destroyAllWindows()

print("👋 Camera closed")