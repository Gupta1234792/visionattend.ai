from flask import Flask, request, jsonify
import cv2
import numpy as np
import time
from insightface.app import FaceAnalysis
from utils.mongo import faces as faces_col

app = Flask(__name__)

MATCH_THRESHOLD = 0.42


# ---------- ArcFace ----------

arcface = FaceAnalysis(
    name="buffalo_l",
    providers=["CPUExecutionProvider"]
)

# CPU mode
arcface.prepare(ctx_id=-1, det_size=(640, 640))


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


# ---------- Test Route ----------

@app.route("/")
def home():
    return {"status": "VisionAttend AI running"}


# ---------- Face Verify ----------

@app.route("/verify", methods=["POST"])
def verify():

    if "image" not in request.files:
        return jsonify({"error": "No image uploaded"}), 400

    file = request.files["image"]

    img = np.frombuffer(file.read(), np.uint8)
    frame = cv2.imdecode(img, cv2.IMREAD_COLOR)

    faces = arcface.get(frame)

    if not faces:
        return {"status": "no_face"}

    if len(faces) > 1:
        return {"status": "multiple_faces"}

    face = faces[0]

    emb = face.embedding

    user, score = find_match(emb)

    if user:

        return {
            "status": "already_registered",
            "studentId": user["studentId"],
            "score": score
        }

    now = time.time()

    new_id = f"student_{int(now)}"

    faces_col.insert_one({
        "studentId": new_id,
        "embedding": emb.tolist(),
        "createdAt": now
    })

    return {
        "status": "registered",
        "studentId": new_id
    }


# ---------- Run Server ----------

if __name__ == "__main__":

    app.run(
        host="0.0.0.0",
        port=10000
    )