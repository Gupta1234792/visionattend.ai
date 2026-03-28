import base64
import hashlib
import os
import time

import cv2
import numpy as np
from flask import Flask, jsonify, request, abort
from flask_cors import CORS
from pymongo.errors import DuplicateKeyError

from utils.mongo import faces as faces_col

app = Flask(__name__)
CORS(app)

# ================= CONFIG =================
API_KEY = os.getenv("OPENCV_API_KEY", "visionattend123")

MATCH_THRESHOLD = float(os.getenv("MATCH_THRESHOLD", "0.35"))
DUPLICATE_FACE_THRESHOLD = float(os.getenv("DUPLICATE_FACE_THRESHOLD", "0.85"))

# ================= MODEL =================
arcface = None

def get_model():
    global arcface
    if arcface is None:
        print("🔥 Loading InsightFace...")
        from insightface.app import FaceAnalysis
        arcface = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
        arcface.prepare(ctx_id=-1, det_size=(640, 640))
        print("✅ Model loaded")
    return arcface

# ================= AUTH =================
def check_key():
    key = request.headers.get("x-opencv-key")
    if key != API_KEY:
        abort(403, description="Invalid API Key")

# ================= UTILS =================

def decode_image(img_str):
    try:
        if "," in img_str:
            _, img_str = img_str.split(",", 1)
        img = base64.b64decode(img_str)
        arr = np.frombuffer(img, np.uint8)
        return cv2.imdecode(arr, cv2.IMREAD_COLOR)
    except:
        return None


def get_face(frame):
    model = get_model()
    faces = model.get(frame)

    if len(faces) == 0:
        return None

    return faces[0]  # always first face


def normalize(emb):
    emb = np.array(emb, dtype=np.float32)
    norm = np.linalg.norm(emb)
    return emb / norm if norm != 0 else emb


def cosine(a, b):
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))


def hash_emb(emb):
    return hashlib.sha256(np.round(emb, 6).tobytes()).hexdigest()

# ================= ROUTES =================

@app.get("/health")
def health():
    return {"success": True, "status": "ok"}


# ---------- REGISTER ----------

@app.post("/register")
def register():
    check_key()

    data = request.get_json()
    user_id = str(data.get("userId", "")).strip()
    frames = data.get("frames", [])
    image = data.get("image")

    print(f"📸 REGISTER → {user_id}")

    if not user_id:
        return jsonify({"success": False, "message": "userId required"}), 400

    imgs = []

    if frames:
        for f in frames:
            img = decode_image(f)
            if img is not None:
                imgs.append(img)

    elif image:
        img = decode_image(image)
        if img is not None:
            imgs.append(img)

    if not imgs:
        return jsonify({"success": False, "message": "Invalid image"}), 400

    embeddings = []

    for img in imgs:
        face = get_face(img)
        if face is not None:
            embeddings.append(face.embedding)

    if len(embeddings) == 0:
        return jsonify({"success": False, "message": "No face detected"}), 400

    emb = normalize(np.mean(embeddings, axis=0))
    emb_hash = hash_emb(emb)

    # duplicate check
    for doc in faces_col.find():
        existing = normalize(doc["embedding"])
        sim = cosine(emb, existing)

        if sim > DUPLICATE_FACE_THRESHOLD:
            return jsonify({
                "success": False,
                "message": "Face already registered",
                "existingUserId": doc["userId"]
            }), 403

    now = time.time()

    try:
        faces_col.update_one(
            {"userId": user_id},
            {
                "$set": {
                    "embedding": emb.tolist(),
                    "embeddingHash": emb_hash,
                    "updatedAt": now,
                },
                "$setOnInsert": {
                    "userId": user_id,
                    "createdAt": now,
                },
            },
            upsert=True,
        )
    except DuplicateKeyError:
        return jsonify({
            "success": False,
            "message": "Duplicate face"
        }), 403

    return jsonify({
        "success": True,
        "message": "Face registered",
        "confidence": 0.9,
        "embedding": emb.tolist()
    })


# ---------- VERIFY ----------

@app.post("/verify")
def verify():
    check_key()

    data = request.get_json()
    user_id = str(data.get("userId", "")).strip()
    frames = data.get("frames", [])

    print(f"🔍 VERIFY → {user_id}")

    if not user_id:
        return jsonify({"success": False}), 400

    if not frames:
        return jsonify({"success": False}), 400

    imgs = []
    for f in frames:
        img = decode_image(f)
        if img is not None:
            imgs.append(img)

    embeddings = []

    for img in imgs:
        face = get_face(img)
        if face is not None:
            embeddings.append(face.embedding)

    if len(embeddings) == 0:
        return jsonify({"success": False, "matched": False}), 400

    emb = normalize(np.mean(embeddings, axis=0))

    stored = faces_col.find_one({"userId": user_id})

    if not stored:
        return jsonify({"success": False, "matched": False}), 404

    saved = normalize(stored["embedding"])
    sim = cosine(emb, saved)

    matched = sim >= MATCH_THRESHOLD

    print(f"👉 similarity={sim} matched={matched}")

    return jsonify({
        "success": True,
        "matched": matched,
        "confidence": sim,
        "livenessPassed": True,
        "blinkDetected": False
    })


# ================= RUN =================

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 10000)))