import cv2
import numpy as np
import time
from flask import Flask, request, jsonify
from insightface.app import FaceAnalysis
from utils.mongo import faces as faces_col


# ================= CONFIG =================

MATCH_THRESHOLD = 0.42

# ==========================================


app = Flask(__name__)


# ---------- ArcFace Model ----------

arcface = FaceAnalysis(
    name="buffalo_l",
    providers=["CPUExecutionProvider"]
)

arcface.prepare(ctx_id=0, det_size=(640, 640))


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


# ================= ROUTES =================

@app.route("/")
def home():
    return {"status": "VisionAttend AI running"}


@app.route("/verify", methods=["POST"])
def verify():

    if "image" not in request.files:
        return jsonify({"error": "No image provided"}), 400

    file = request.files["image"]

    img = np.frombuffer(file.read(), np.uint8)
    frame = cv2.imdecode(img, cv2.IMREAD_COLOR)

    if frame is None:
        return jsonify({"error": "Invalid image"}), 400


    faces = arcface.get(frame)

    if not faces:
        return jsonify({"status": "no_face"})

    if len(faces) > 1:
        return jsonify({"status": "multiple_faces"})


    face = faces[0]
    emb = face.embedding


    # ---------- MATCH ----------

    user, score = find_match(emb)

    if user:

        return jsonify({
            "status": "already_registered",
            "studentId": user["studentId"],
            "score": score
        })


    # ---------- REGISTER NEW ----------

    now = time.time()

    new_id = f"student_{int(now)}"

    faces_col.insert_one({
        "studentId": new_id,
        "embedding": emb.tolist(),
        "model": "arcface_buffalo_l",
        "dim": 512,
        "createdAt": now
    })

    return jsonify({
        "status": "registered_new",
        "studentId": new_id
    })


# ================= RUN SERVER =================

if __name__ == "__main__":

    app.run(
        host="0.0.0.0",
        port=10000
    )