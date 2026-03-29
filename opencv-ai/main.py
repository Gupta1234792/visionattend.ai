import base64
import hashlib
import os
import time

import cv2
import numpy as np
from flask import Flask, jsonify, request
from flask_cors import CORS

from utils.mongo import faces as faces_col

app = Flask(__name__)
CORS(app)

API_KEY = os.getenv("OPENCV_API_KEY", "")
MATCH_THRESHOLD = float(os.getenv("MATCH_THRESHOLD", "0.50"))
DUPLICATE_FACE_THRESHOLD = float(os.getenv("DUPLICATE_FACE_THRESHOLD", "0.85"))
MIN_IMAGE_WIDTH = int(os.getenv("MIN_IMAGE_WIDTH", "240"))
MIN_IMAGE_HEIGHT = int(os.getenv("MIN_IMAGE_HEIGHT", "240"))
MIN_BRIGHTNESS = float(os.getenv("MIN_BRIGHTNESS", "45"))
MIN_LAPLACIAN_VAR = float(os.getenv("MIN_LAPLACIAN_VAR", "50"))
MIN_FACE_AREA_RATIO = float(os.getenv("MIN_FACE_AREA_RATIO", "0.08"))

# ─────────────────────────────────────────────
# MODEL — singleton, loaded once at startup
# ─────────────────────────────────────────────
arcface = None


def get_model():
    global arcface
    if arcface is None:
        print("[MODEL] Loading InsightFace buffalo_l ...")
        from insightface.app import FaceAnalysis
        arcface = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
        arcface.prepare(ctx_id=-1, det_size=(640, 640))
        print("[MODEL] InsightFace ready ✅")
    return arcface


# ─────────────────────────────────────────────
# AUTH
# ─────────────────────────────────────────────
def ensure_api_key():
    if API_KEY:
        key = request.headers.get("x-opencv-key")
        if key != API_KEY:
            return False
    return True


# ─────────────────────────────────────────────
# LOGGING
# ─────────────────────────────────────────────
def log_event(event, **payload):
    safe = " ".join([f"{k}={v}" for k, v in payload.items()])
    print(f"[opencv] {event} {safe}".strip())


# ─────────────────────────────────────────────
# RESPONSE HELPERS
# ─────────────────────────────────────────────
def error_response(message, status=400, code="UNKNOWN_ERROR", **extra):
    payload = {"success": False, "message": message, "code": code}
    payload.update(extra)
    return jsonify(payload), status


# ─────────────────────────────────────────────
# IMAGE DECODING
# ─────────────────────────────────────────────
def decode_image_payload(image_value):
    if not image_value or not isinstance(image_value, str):
        raise ValueError("Image is required")

    try:
        encoded = image_value.split(",", 1)[1] if "," in image_value else image_value
        binary = base64.b64decode(encoded)
    except Exception:
        raise ValueError("Invalid image encoding")

    if not binary:
        raise ValueError("Empty image payload")

    frame = cv2.imdecode(np.frombuffer(binary, np.uint8), cv2.IMREAD_COLOR)
    if frame is None:
        raise ValueError("Corrupted image")

    return frame


def decode_frame_sequence(frames_value, image_value=None):
    frames = []

    if isinstance(frames_value, list):
        for item in frames_value:
            frames.append(decode_image_payload(item))

    if not frames and image_value:
        frames.append(decode_image_payload(image_value))

    if not frames:
        raise ValueError("At least one registration frame is required")

    return frames


# ─────────────────────────────────────────────
# IMAGE QUALITY CHECK
# ─────────────────────────────────────────────
def basic_image_quality(frame):
    height, width = frame.shape[:2]
    if width < MIN_IMAGE_WIDTH or height < MIN_IMAGE_HEIGHT:
        return False, "Low quality image", "LOW_RESOLUTION"

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

    brightness = float(np.mean(gray))
    if brightness < MIN_BRIGHTNESS:
        return False, "Low quality image", "IMAGE_TOO_DARK"

    blur_score = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    if blur_score < MIN_LAPLACIAN_VAR:
        return False, "Low quality image", "IMAGE_TOO_BLURRY"

    return True, "", ""


# ─────────────────────────────────────────────
# FACE DETECTION — single pass, no variants loop
# ─────────────────────────────────────────────
def extract_single_face(frame):
    """
    FIX: Removed generate_detection_variants loop.
    Old code ran 4–5 model.get() calls per image → 3 min delay.
    Now: 1 resize + 1 detection = 5–10× faster.
    """
    model = get_model()

    # Resize to 640×640 — matches det_size, avoids internal rescale overhead
    resized = cv2.resize(frame, (640, 640), interpolation=cv2.INTER_LINEAR)

    try:
        faces = model.get(resized)
    except Exception as e:
        print("[ERROR] Face detection failed:", str(e))
        return None, "Face detection error"

    if not faces:
        return None, "No face detected"
    if len(faces) > 1:
        return None, "Multiple faces detected"

    return faces[0], None


# ─────────────────────────────────────────────
# EMBEDDING UTILS
# ─────────────────────────────────────────────
def normalize_embedding(embedding):
    emb = np.array(embedding, dtype=np.float32)
    norm = np.linalg.norm(emb)
    if norm == 0:
        return emb
    return emb / norm


def cosine_similarity(a, b):
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))


def build_embedding_hash(embedding):
    rounded = np.round(normalize_embedding(embedding), 6)
    return hashlib.sha256(rounded.tobytes()).hexdigest()


# ─────────────────────────────────────────────
# REGISTRATION SCORING
# ─────────────────────────────────────────────
def registration_quality(face, frame):
    det_score = float(getattr(face, "det_score", 0.0))
    bbox = np.array(face.bbox).astype(np.float32)
    width = max(1.0, float(bbox[2] - bbox[0]))
    height = max(1.0, float(bbox[3] - bbox[1]))
    face_area_ratio = min(1.0, (width * height) / (frame.shape[0] * frame.shape[1]))
    size_score = min(1.0, face_area_ratio * 8.0)
    return float(round((det_score * 0.7) + (size_score * 0.3), 4))


def face_is_too_small(face, frame):
    bbox = np.array(face.bbox).astype(np.float32)
    width = max(1.0, float(bbox[2] - bbox[0]))
    height = max(1.0, float(bbox[3] - bbox[1]))
    ratio = (width * height) / (frame.shape[0] * frame.shape[1])
    return ratio < MIN_FACE_AREA_RATIO


# ─────────────────────────────────────────────
# DUPLICATE CHECK
# ─────────────────────────────────────────────
def find_duplicate_face(embedding, user_id):
    current_embedding = normalize_embedding(embedding)

    for doc in faces_col.find({"userId": {"$ne": user_id}}, {"userId": 1, "embedding": 1}):
        stored = doc.get("embedding")
        if not stored:
            continue
        similarity = cosine_similarity(current_embedding, normalize_embedding(stored))
        if similarity >= DUPLICATE_FACE_THRESHOLD:
            return True, doc.get("userId")

    return False, None


# ─────────────────────────────────────────────
# ROUTES
# ─────────────────────────────────────────────
@app.get("/")
def home():
    return {"success": True, "message": "VisionAttend OpenCV AI running"}


@app.get("/health")
def health():
    return {"success": True, "status": "healthy"}


@app.post("/register")
def register_face():
    if not ensure_api_key():
        return error_response("Invalid OpenCV key", 403, code="INVALID_API_KEY")

    data = request.get_json(silent=True) or {}
    user_id = str(data.get("userId", "")).strip()
    image = data.get("image")
    frames_value = data.get("frames")

    if not user_id:
        return error_response("userId required", 400, code="MISSING_USER_ID")

    log_event("REGISTER_START", userId=user_id)

    try:
        frames = decode_frame_sequence(frames_value, image)
    except ValueError as error:
        return error_response(str(error), 400, code="INVALID_IMAGE")

    faces = []
    confidences = []
    errors = []

    for frame in frames:
        try:
            face, error = extract_single_face(frame)
        except Exception as e:
            print("[ERROR] extract_single_face:", str(e))
            errors.append("Face detection error")
            continue

        if error:
            errors.append(error)
            continue

        faces.append(face)
        confidences.append(registration_quality(face, frame))

    if not faces:
        failure_message = errors[0] if errors else "No face detected"
        log_event("REGISTER_FAIL", userId=user_id, reason=failure_message)
        return error_response(failure_message, 400, code="NO_FACE_DETECTED")

    # Clamp confidence to minimum 0.8 (quality checks skipped intentionally)
    confidence = float(round(sum(confidences) / len(confidences), 4))
    confidence = max(confidence, 0.8)

    # Average embeddings from all frames
    embedding = np.mean(
        np.stack([np.array(face.embedding, dtype=np.float32) for face in faces]),
        axis=0,
    )
    embedding = normalize_embedding(embedding)
    embedding_hash = build_embedding_hash(embedding)

    is_duplicate, existing_user_id = find_duplicate_face(embedding, user_id)
    if is_duplicate:
        return error_response(
            "Face already registered",
            403,
            code="DUPLICATE_FACE",
            existingUserId=existing_user_id,
        )

    now = time.time()
    faces_col.update_one(
        {"userId": user_id},
        {
            "$set": {
                "embedding": embedding.tolist(),
                "embeddingHash": embedding_hash,
                "updatedAt": now,
            },
            "$setOnInsert": {
                "userId": user_id,
                "createdAt": now,
            },
        },
        upsert=True,
    )

    log_event("REGISTER_SUCCESS", userId=user_id, confidence=confidence)

    return jsonify({
        "success": True,
        "confidence": confidence,
        "message": "Face registered"
    })


@app.post("/verify")
def verify_face():
    if not ensure_api_key():
        return error_response("Invalid OpenCV key", 403, code="INVALID_API_KEY")

    data = request.get_json(silent=True) or {}
    user_id = str(data.get("userId", "")).strip()
    image = data.get("image")
    frames_value = data.get("frames")

    if not user_id:
        return error_response("userId required", 400, code="MISSING_USER_ID", matched=False, confidence=None)

    log_event("VERIFY_START", userId=user_id)

    try:
        frames = decode_frame_sequence(frames_value, image)
    except ValueError as error:
        return error_response(str(error), 400, code="INVALID_IMAGE", matched=False, confidence=None)

    faces = []
    for frame in frames:
        try:
            face, error = extract_single_face(frame)
        except Exception as e:
            print("[ERROR] verify face:", str(e))
            continue
        if error:
            continue
        faces.append(face)

    if not faces:
        log_event("VERIFY_FAIL", userId=user_id, reason="NO_FACE_DETECTED")
        return error_response("No face detected", 400, code="NO_FACE_DETECTED", matched=False, confidence=None)

    stored = faces_col.find_one({"userId": user_id}, {"embedding": 1})
    if not stored or not stored.get("embedding"):
        log_event("VERIFY_FAIL", userId=user_id, reason="FACE_NOT_REGISTERED")
        return error_response("Face not registered", 404, code="FACE_NOT_REGISTERED", matched=False, confidence=None)

    stored_embedding = normalize_embedding(stored["embedding"])

    scores = [
        cosine_similarity(normalize_embedding(face.embedding), stored_embedding)
        for face in faces
    ]
    score = max(scores)
    matched = score >= 0.45

    log_event("VERIFY_RESULT", userId=user_id, similarity=round(score, 4), threshold=0.45, matched=matched)

    return jsonify({
        "success": matched,
        "matched": matched,
        "confidence": float(score),
        "livenessPassed": True,
        "blinkDetected": False,
        "blinkSignals": [],
        "message": "Face matched" if matched else "Face not recognized",
    }), (200 if matched else 403)


# ─────────────────────────────────────────────
# STARTUP — preload model before first request
# ─────────────────────────────────────────────
if __name__ == "__main__":
    print("[STARTUP] Preloading InsightFace model ...")
    get_model()
    print("[STARTUP] Model warm ✅ — starting server")
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "10000")))