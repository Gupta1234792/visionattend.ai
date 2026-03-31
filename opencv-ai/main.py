from dotenv import load_dotenv

load_dotenv()

import base64
import hashlib
import os
import re
from datetime import datetime, timedelta, timezone

import cv2
import numpy as np
from bson import ObjectId
from flask import Flask, jsonify, request
from flask_cors import CORS

from utils.mongo import get_database, get_faces_collection, get_mongo_status

app = Flask(__name__)
CORS(
    app,
    supports_credentials=True,
    resources={r"/*": {"origins": "*"}},
    allow_headers=["Content-Type", "x-opencv-key", "x-opencv-client", "Authorization"],
    methods=["GET", "POST", "OPTIONS"],
)

API_KEY = os.getenv("OPENCV_API_KEY", "").strip()
CLIENT_ID = os.getenv("OPENCV_CLIENT_ID", "backend").strip()
MATCH_THRESHOLD = float(os.getenv("MATCH_THRESHOLD", "0.50"))
DUPLICATE_FACE_THRESHOLD = float(os.getenv("DUPLICATE_FACE_THRESHOLD", "0.75"))
MIN_IMAGE_WIDTH = int(os.getenv("MIN_IMAGE_WIDTH", "240"))
MIN_IMAGE_HEIGHT = int(os.getenv("MIN_IMAGE_HEIGHT", "240"))
MIN_BRIGHTNESS = float(os.getenv("MIN_BRIGHTNESS", "45"))
MIN_LAPLACIAN_VAR = float(os.getenv("MIN_LAPLACIAN_VAR", "50"))
MIN_FACE_AREA_RATIO = float(os.getenv("MIN_FACE_AREA_RATIO", "0.05"))
REPLAY_WINDOW_SECONDS = int(os.getenv("REPLAY_WINDOW_SECONDS", "30"))
BLINK_DROP_THRESHOLD = float(os.getenv("BLINK_DROP_THRESHOLD", "0.045"))
BLINK_MIN_FRAMES = int(os.getenv("BLINK_MIN_FRAMES", "3"))
MODEL_ROOT = os.getenv("INSIGHTFACE_HOME", "/root/.insightface")

arcface = None


def get_model():
    global arcface
    if arcface is None:
        from insightface.app import FaceAnalysis

        print("[MODEL] Loading InsightFace buffalo_l")
        arcface = FaceAnalysis(
            name="buffalo_l",
            root=MODEL_ROOT,
            providers=["CPUExecutionProvider"],
        )
        arcface.prepare(ctx_id=-1, det_size=(640, 640))
        print("[MODEL] InsightFace ready")
    return arcface


def ensure_api_key():
    if API_KEY:
        key = request.headers.get("x-opencv-key", "").strip()
        if key != API_KEY:
            return False, "Invalid OpenCV key", "INVALID_API_KEY"

    client_id = request.headers.get("x-opencv-client", "").strip()
    if client_id != CLIENT_ID:
        return False, "Invalid OpenCV client", "INVALID_OPENCV_CLIENT"

    return True, None, None


def log_event(event, **payload):
    safe = " ".join([f"{k}={v}" for k, v in payload.items()])
    print(f"[opencv] {event} {safe}".strip())


def error_response(message, status=400, code="UNKNOWN_ERROR", **extra):
    payload = {"success": False, "message": message, "code": code}
    payload.update(extra)
    return jsonify(payload), status


def decode_image_payload(image_value):
    if not image_value or not isinstance(image_value, str):
        raise ValueError("Image is required")

    if not image_value.startswith("data:image/"):
        raise ValueError("Invalid image format")

    try:
        encoded = image_value.split(",", 1)[1] if "," in image_value else image_value
        encoded = re.sub(r"\s+", "", encoded)
        missing_padding = len(encoded) % 4
        if missing_padding:
            encoded += "=" * (4 - missing_padding)
        binary = base64.b64decode(encoded, validate=False)
    except Exception as exc:
        raise ValueError("Invalid image encoding") from exc

    if not binary:
        raise ValueError("Empty image payload")

    frame = cv2.imdecode(np.frombuffer(binary, np.uint8), cv2.IMREAD_COLOR)
    if frame is None:
        raise ValueError("Corrupted image")

    # InsightFace expects the OpenCV-native BGR frame.
    return frame


def decode_frame_sequence(frames_value, image_value=None):
    frames = []
    payloads = []

    if isinstance(frames_value, list):
        for item in frames_value:
            payloads.append(item)
            frames.append(decode_image_payload(item))

    if not frames and image_value:
        payloads.append(image_value)
        frames.append(decode_image_payload(image_value))

    if not frames:
        raise ValueError("At least one image frame is required")

    return frames, payloads


def basic_image_quality(frame):
    height, width = frame.shape[:2]
    if width < MIN_IMAGE_WIDTH or height < MIN_IMAGE_HEIGHT:
        return False, "Low quality image", "LOW_RESOLUTION"

    gray = cv2.cvtColor(frame, cv2.COLOR_RGB2GRAY)
    brightness = float(np.mean(gray))
    if brightness < MIN_BRIGHTNESS:
        return False, "Low quality image", "IMAGE_TOO_DARK"

    blur_score = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    if blur_score < MIN_LAPLACIAN_VAR:
        return False, "Low quality image", "IMAGE_TOO_BLURRY"

    return True, "", ""


def extract_single_face(frame):
    try:
        faces = get_model().get(frame)
    except Exception as exc:
        print(f"[opencv] face detection error={exc}")
        return None, "Face detection error", "FACE_DETECTION_ERROR"

    if not faces:
        return None, "No face detected", "NO_FACE_DETECTED"
    if len(faces) > 1:
        return None, "Multiple faces detected", "MULTIPLE_FACES_DETECTED"

    return faces[0], None, None


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


def build_payload_hash(payload):
    encoded = payload.split(",", 1)[1] if "," in payload else payload
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


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


def get_user_document(user_id):
    if not ObjectId.is_valid(user_id):
        return None

    db = get_database()
    return db["users"].find_one(
        {
            "_id": ObjectId(user_id),
            "role": "student",
            "isActive": True,
        },
        {"_id": 1, "role": 1, "isActive": 1},
    )


def find_duplicate_face(embedding, user_id):
    faces_col = get_faces_collection()
    current_embedding = normalize_embedding(embedding)
    for doc in faces_col.find({"userId": {"$ne": user_id}}, {"userId": 1, "embedding": 1}):
        stored = doc.get("embedding")
        if not stored:
            continue
        similarity = cosine_similarity(current_embedding, normalize_embedding(stored))
        if similarity >= DUPLICATE_FACE_THRESHOLD:
            return True, doc.get("userId")
    return False, None


def extract_landmarks(face):
    for attr in ("landmark_3d_68", "landmark_2d_106"):
        value = getattr(face, attr, None)
        if value is None:
            continue
        points = np.array(value, dtype=np.float32)
        if points.ndim == 2 and points.shape[0] >= 68:
            return points[:, :2]
    return None


def compute_ear(points):
    if points is None or len(points) < 68:
        return None

    def eye_ratio(indices):
        p1, p2, p3, p4, p5, p6 = [points[index] for index in indices]
        vertical = np.linalg.norm(p2 - p6) + np.linalg.norm(p3 - p5)
        horizontal = max(np.linalg.norm(p1 - p4), 1e-6)
        return float(vertical / (2.0 * horizontal))

    left_ear = eye_ratio([36, 37, 38, 39, 40, 41])
    right_ear = eye_ratio([42, 43, 44, 45, 46, 47])
    return float((left_ear + right_ear) / 2.0)


def detect_blink(ears):
    valid = [ear for ear in ears if ear is not None]
    if len(valid) < BLINK_MIN_FRAMES:
        return False, []

    max_ear = max(valid)
    min_ear = min(valid)
    blink_detected = (max_ear - min_ear) >= BLINK_DROP_THRESHOLD
    return blink_detected, [round(value, 4) for value in valid]


def extract_faces_for_frames(frames):
    faces = []
    confidences = []
    ears = []
    errors = []

    for frame in frames:
        face, error_message, error_code = extract_single_face(frame)
        if error_message:
            errors.append((error_message, error_code))
            continue

        faces.append(face)
        confidences.append(registration_quality(face, frame))
        ears.append(compute_ear(extract_landmarks(face)))

    return faces, confidences, ears, errors


def pick_detection_failure(errors, fallback_message, fallback_code):
    if not errors:
        return fallback_message, fallback_code

    priority = {
        "MULTIPLE_FACES_DETECTED": 3,
        "NO_FACE_DETECTED": 2,
        "FACE_TOO_SMALL": 2,
        "LOW_RESOLUTION": 1,
        "IMAGE_TOO_DARK": 1,
        "IMAGE_TOO_BLURRY": 1,
        "FACE_DETECTION_ERROR": 1,
    }
    best = max(errors, key=lambda item: priority.get(item[1], 0))
    return best


@app.get("/")
def home():
    return {"success": True, "message": "VisionAttend OpenCV AI running"}


@app.get("/health")
def health():
    return {"success": True, "status": "healthy"}


@app.get("/health/db")
def health_db():
    mongo = get_mongo_status()
    status = "healthy" if mongo["connected"] else "degraded"
    return {"success": True, "status": status, "mongo": mongo}


@app.post("/register")
def register_face():
    is_allowed, auth_message, auth_code = ensure_api_key()
    if not is_allowed:
        return error_response(auth_message, 403, code=auth_code)

    data = request.get_json(silent=True) or {}
    user_id = str(data.get("userId", "")).strip()
    image = data.get("image")
    frames_value = data.get("frames")

    if not user_id:
        return error_response("userId required", 400, code="MISSING_USER_ID")

    log_event("REGISTER_START", userId=user_id)

    if not get_user_document(user_id):
        return error_response("Student not found", 404, code="USER_NOT_FOUND")

    try:
        faces_col = get_faces_collection()
    except Exception as exc:
        return error_response("Database unavailable", 503, code="DB_UNAVAILABLE", detail=str(exc))

    try:
        frames, _ = decode_frame_sequence(frames_value, image)
    except ValueError as error:
        return error_response(str(error), 400, code="INVALID_IMAGE")

    faces, confidences, _, errors = extract_faces_for_frames(frames)
    if not faces:
        message, code = pick_detection_failure(errors, "No face detected", "NO_FACE_DETECTED")
        return error_response(message, 400, code=code)

    confidence = float(round(sum(confidences) / len(confidences), 4))
    embedding = np.mean(
        np.stack([np.array(face.embedding, dtype=np.float32) for face in faces]),
        axis=0,
    )
    embedding = normalize_embedding(embedding)
    embedding_hash = build_embedding_hash(embedding)

    existing_hash = faces_col.find_one(
        {"embeddingHash": embedding_hash, "userId": {"$ne": user_id}},
        {"userId": 1},
    )
    if existing_hash:
        return error_response(
            "Face already registered",
            409,
            code="DUPLICATE_FACE",
            existingUserId=existing_hash.get("userId"),
        )

    is_duplicate, existing_user_id = find_duplicate_face(embedding, user_id)
    if is_duplicate:
        return error_response(
            "Face already registered",
            409,
            code="DUPLICATE_FACE",
            existingUserId=existing_user_id,
        )

    now = datetime.now(timezone.utc)
    faces_col.update_one(
        {"userId": user_id},
        {
            "$set": {
                "userId": user_id,
                "embedding": embedding.tolist(),
                "embeddingHash": embedding_hash,
                "updatedAt": now,
            },
            "$setOnInsert": {
                "createdAt": now,
            },
        },
        upsert=True,
    )

    return jsonify(
        {
            "success": True,
            "confidence": confidence,
            "embedding": embedding.tolist(),
            "message": "Face registered",
        }
    )


@app.post("/verify")
def verify_face():
    is_allowed, auth_message, auth_code = ensure_api_key()
    if not is_allowed:
        return error_response(auth_message, 403, code=auth_code)

    data = request.get_json(silent=True) or {}
    user_id = str(data.get("userId", "")).strip()
    image = data.get("image")
    frames_value = data.get("frames")

    if not user_id:
        return error_response("userId required", 400, code="MISSING_USER_ID", matched=False, confidence=None)

    print(f"[VERIFY] userId={user_id}")

    if not get_user_document(user_id):
        return error_response("Student not found", 404, code="USER_NOT_FOUND", matched=False, confidence=None)

    try:
        faces_col = get_faces_collection()
    except Exception as exc:
        return error_response("Database unavailable", 503, code="DB_UNAVAILABLE", matched=False, confidence=None, detail=str(exc))

    try:
        frames, payloads = decode_frame_sequence(frames_value, image)
    except ValueError as error:
        return error_response(str(error), 400, code="INVALID_IMAGE", matched=False, confidence=None)

    faces, _, ears, errors = extract_faces_for_frames(frames)
    if not faces:
        message, code = pick_detection_failure(errors, "No face detected", "NO_FACE_DETECTED")
        return error_response(message, 400, code=code, matched=False, confidence=None)

    frame_hashes = [build_payload_hash(payload) for payload in payloads if isinstance(payload, str)]
    unique_frame_hashes = list(dict.fromkeys(frame_hashes))
    if len(unique_frame_hashes) < 2:
        return error_response(
            "Live scan requires multiple unique frames",
            403,
            code="REPLAY_DETECTED",
            matched=False,
            confidence=None,
            livenessPassed=False,
            blinkDetected=False,
        )

    stored = faces_col.find_one({"userId": user_id}, {"embedding": 1, "lastVerificationHash": 1, "lastVerifiedAt": 1})
    if not stored or not stored.get("embedding"):
        return error_response("Face not registered", 404, code="FACE_NOT_REGISTERED", matched=False, confidence=None)

    replay_hash = hashlib.sha256("|".join(unique_frame_hashes).encode("utf-8")).hexdigest()
    last_hash = stored.get("lastVerificationHash")
    last_verified_at = stored.get("lastVerifiedAt")
    if isinstance(last_verified_at, datetime):
        now = datetime.now(timezone.utc)
        normalized_last = last_verified_at if last_verified_at.tzinfo else last_verified_at.replace(tzinfo=timezone.utc)
        if last_hash == replay_hash and now - normalized_last <= timedelta(seconds=REPLAY_WINDOW_SECONDS):
            return error_response(
                "Replay attack detected",
                403,
                code="REPLAY_DETECTED",
                matched=False,
                confidence=None,
                livenessPassed=False,
                blinkDetected=False,
            )

    stored_embedding = normalize_embedding(stored["embedding"])
    scores = [cosine_similarity(normalize_embedding(face.embedding), stored_embedding) for face in faces]
    score = max(scores)
    matched = score >= MATCH_THRESHOLD

    blink_detected, blink_signals = detect_blink(ears)
    liveness_passed = blink_detected

    if not matched:
        print(f"[RESULT] fail userId={user_id} reason=FACE_NOT_RECOGNIZED score={round(score, 4)}")
        return error_response(
            "Face not recognized",
            403,
            code="FACE_NOT_RECOGNIZED",
            matched=False,
            confidence=float(score),
            livenessPassed=blink_detected,
            blinkDetected=blink_detected,
            blinkSignals=blink_signals,
        )

    now = datetime.now(timezone.utc)
    faces_col.update_one(
        {"userId": user_id},
        {
            "$set": {
                "lastVerificationHash": replay_hash,
                "lastVerifiedAt": now,
                "updatedAt": now,
            }
        },
    )

    print(f"[RESULT] match userId={user_id} score={round(score, 4)}")
    log_event("VERIFY_RESULT", userId=user_id, similarity=round(score, 4), threshold=MATCH_THRESHOLD, matched=matched)

    return jsonify(
        {
            "success": True,
            "matched": True,
            "confidence": float(score),
            "livenessPassed": liveness_passed,
            "blinkDetected": blink_detected,
            "blinkSignals": blink_signals,
            "message": "Face matched",
        }
    )


if __name__ == "__main__":
    print("[STARTUP] Preloading InsightFace model")
    get_model()
    print("[STARTUP] Model warm")
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "10000")))
