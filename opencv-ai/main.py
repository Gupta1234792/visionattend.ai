import base64
import hashlib
import os
import time

import cv2
import numpy as np
from flask import Flask, jsonify, request
from flask_cors import CORS
from pymongo.errors import DuplicateKeyError

from utils.mongo import faces as faces_col

app = Flask(__name__)
CORS(app)

MATCH_THRESHOLD = float(os.getenv("MATCH_THRESHOLD", "0.65"))
REGISTER_THRESHOLD = float(os.getenv("REGISTER_THRESHOLD", "0.70"))
DUPLICATE_FACE_THRESHOLD = float(os.getenv("DUPLICATE_FACE_THRESHOLD", "0.85"))
LIVENESS_MIN_FRAMES = max(6, int(os.getenv("LIVENESS_MIN_FRAMES", "6")))
BLINK_MIN_DROP = float(os.getenv("BLINK_MIN_DROP", "0.035"))
BLINK_RECOVERY_DROP = float(os.getenv("BLINK_RECOVERY_DROP", "0.020"))

# Lazy load the model to prevent memory issues during startup
arcface = None

def get_arcface_model():
    global arcface
    if arcface is None:
        print("Loading InsightFace model...")
        from insightface.app import FaceAnalysis
        arcface = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
        arcface.prepare(ctx_id=-1, det_size=(640, 640))
        print("InsightFace loaded")
    return arcface


def decode_image_payload(image_value):
    if not image_value or not isinstance(image_value, str):
        raise ValueError("Image is required")

    if "," in image_value:
        _, encoded = image_value.split(",", 1)
    else:
        encoded = image_value

    binary = base64.b64decode(encoded)
    frame = cv2.imdecode(np.frombuffer(binary, np.uint8), cv2.IMREAD_COLOR)

    if frame is None:
        raise ValueError("Image decode failed")

    return frame


def decode_frame_sequence(frames_value):
    if not isinstance(frames_value, list) or len(frames_value) < LIVENESS_MIN_FRAMES:
        raise ValueError(f"Live blink scan requires at least {LIVENESS_MIN_FRAMES} frames")

    frames = []
    for item in frames_value:
        frames.append(decode_image_payload(item))

    return frames


def decode_registration_frames(frames_value):
    if not isinstance(frames_value, list) or len(frames_value) != 3:
        raise ValueError("Exactly 3 registration frames are required")

    frames = []
    for item in frames_value:
        frames.append(decode_image_payload(item))

    return frames


def extract_single_face(frame):
    arcface_model = get_arcface_model()
    faces = arcface_model.get(frame)

    if not faces:
        return None, "No face detected"

    if len(faces) > 1:
        return None, "Multiple faces detected"

    return faces[0], None


def cosine_similarity(a, b):
    a = np.array(a, dtype=np.float32)
    b = np.array(b, dtype=np.float32)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)

    if norm_a == 0 or norm_b == 0:
        return 0.0

    return float(np.dot(a, b) / (norm_a * norm_b))


def normalize_embedding(embedding):
    normalized = np.array(embedding, dtype=np.float32)
    norm = np.linalg.norm(normalized)
    if norm != 0:
        normalized = normalized / norm
    return normalized


def build_embedding_hash(embedding):
    rounded = np.round(normalize_embedding(embedding), 6)
    return hashlib.sha256(rounded.tobytes()).hexdigest()


def check_duplicate_face(embedding, user_id):
    """Check if face embedding already exists for a different user"""
    # Find all faces except current user
    existing_faces = list(faces_col.find({"userId": {"$ne": user_id}}))
    
    if not existing_faces:
        return False, None
    
    # Convert to numpy arrays for comparison
    current_embedding = normalize_embedding(embedding)
    
    for face in existing_faces:
        stored_embedding = normalize_embedding(face["embedding"])
        similarity = cosine_similarity(current_embedding, stored_embedding)
        
        if similarity > DUPLICATE_FACE_THRESHOLD:
            return True, face["userId"]
    
    return False, None


def registration_quality(face, frame):
    det_score = float(getattr(face, "det_score", 0.0))

    bbox = np.array(face.bbox).astype(np.float32)
    width = max(1.0, float(bbox[2] - bbox[0]))
    height = max(1.0, float(bbox[3] - bbox[1]))

    face_area_ratio = min(1.0, (width * height) / (frame.shape[0] * frame.shape[1]))
    size_score = min(1.0, face_area_ratio * 8.0)

    return float(round((det_score * 0.7) + (size_score * 0.3), 4))


def crop_eye_region(frame, eye_point, eye_distance):
    half_w = max(8, int(eye_distance * 0.18))
    half_h = max(6, int(eye_distance * 0.12))

    cx = int(eye_point[0])
    cy = int(eye_point[1])

    left = max(0, cx - half_w)
    right = min(frame.shape[1], cx + half_w)

    top = max(0, cy - half_h)
    bottom = min(frame.shape[0], cy + half_h)

    if right - left < 8 or bottom - top < 6:
        return None

    return frame[top:bottom, left:right]


def eye_openness_proxy(frame, keypoints):
    if keypoints is None or len(keypoints) < 2:
        return None

    left_eye = np.array(keypoints[0], dtype=np.float32)
    right_eye = np.array(keypoints[1], dtype=np.float32)

    eye_distance = float(np.linalg.norm(right_eye - left_eye))

    if eye_distance < 12:
        return None

    scores = []

    for eye in (left_eye, right_eye):
        roi = crop_eye_region(frame, eye, eye_distance)

        if roi is None:
            return None

        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        gray = cv2.GaussianBlur(gray, (3, 3), 0)
        gray = cv2.equalizeHist(gray)

        dark_threshold = float(np.percentile(gray, 40))
        dark_ratio = float(np.mean(gray <= dark_threshold))

        contrast_score = float(np.std(gray) / 128.0)

        scores.append((dark_ratio * 0.75) + (contrast_score * 0.25))

    return float(np.mean(scores))


def analyze_blink_sequence(frames):
    faces = []
    signals = []

    for frame in frames:
        face, error = extract_single_face(frame)

        if error:
            return {"ok": False, "message": error, "signals": signals}

        signal = eye_openness_proxy(frame, getattr(face, "kps", None))

        if signal is None:
            return {
                "ok": False,
                "message": "Eye landmarks not detected clearly",
                "signals": signals,
            }

        faces.append(face)
        signals.append(signal)

    min_index = int(np.argmin(signals))
    min_signal = float(signals[min_index])

    before_open = max(signals[:min_index], default=min_signal)
    after_open = max(signals[min_index + 1:], default=min_signal)

    best_open = max(before_open, after_open, min_signal)

    blink_drop = best_open - min_signal

    blink_detected = (
        0 < min_index < len(signals) - 1
        and blink_drop >= BLINK_MIN_DROP
        and before_open - min_signal >= BLINK_RECOVERY_DROP
        and after_open - min_signal >= BLINK_RECOVERY_DROP
    )

    return {
        "ok": blink_detected,
        "signals": [round(v, 4) for v in signals],
        "faces": faces,
        "blinkDrop": round(blink_drop, 4),
    }


@app.get("/")
def home():
    return {"success": True, "message": "VisionAttend OpenCV AI running"}


@app.get("/health")
def health():
    return {"success": True, "status": "healthy"}


@app.get("/register")
def register_health():
    return {"success": True, "message": "Register endpoint ready"}


@app.post("/register")
def register_face():
    data = request.get_json()

    user_id = str(data.get("userId", "")).strip()
    image = data.get("image")
    try:
        frame_sequence = decode_registration_frames(data.get("frames"))
        blink_frames = decode_frame_sequence(data.get("blinkFrames"))
    except ValueError as error:
        return jsonify({"success": False, "message": str(error)}), 400

    if not user_id:
        return jsonify({"success": False, "message": "userId required"}), 400

    candidate_frames = frame_sequence or [decode_image_payload(image)]
    faces = []
    confidences = []

    blink_result = analyze_blink_sequence(blink_frames)
    if not blink_result["ok"]:
        return jsonify(
            {
                "success": False,
                "message": "Blink verification failed during registration",
                "livenessPassed": False,
                "blinkDetected": False,
                "blinkSignals": blink_result["signals"],
            }
        ), 403

    for frame in candidate_frames:
        face, error = extract_single_face(frame)

        if error:
            return jsonify({"success": False, "message": error}), 400

        faces.append(face)
        confidences.append(registration_quality(face, frame))

    confidence = float(round(sum(confidences) / len(confidences), 4))

    if confidence < REGISTER_THRESHOLD:
        return jsonify({"success": False, "message": "Face quality too low"}), 403

    embedding = np.mean(
        np.stack([np.array(face.embedding, dtype=np.float32) for face in faces]),
        axis=0,
    )
    embedding = normalize_embedding(embedding)
    embedding_hash = build_embedding_hash(embedding)
    
    # Check for duplicate face registration
    is_duplicate, existing_user = check_duplicate_face(embedding, user_id)
    if is_duplicate:
        return jsonify({
            "success": False,
            "message": "Face already registered with another account",
            "existingUserId": existing_user
        }), 403

    now = time.time()

    try:
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
    except DuplicateKeyError:
        return jsonify({
            "success": False,
            "message": "Face already registered with another account"
        }), 403

    return jsonify(
        {
            "success": True,
            "message": "Face registered",
            "confidence": confidence,
            "embedding": embedding.tolist(),
            "frameCount": len(candidate_frames),
            "blinkDetected": True,
            "livenessPassed": True,
        }
    )


@app.post("/verify")
def verify_face():
    data = request.get_json()

    user_id = str(data.get("userId", "")).strip()
    frames_value = data.get("frames")

    if not user_id:
        return jsonify({"success": False, "message": "userId required"}), 400

    try:
        frames = decode_frame_sequence(frames_value)
    except ValueError as error:
        return jsonify({"success": False, "message": str(error)}), 400

    blink_result = analyze_blink_sequence(frames)

    if not blink_result["ok"]:
        return jsonify(
            {
                "success": False,
                "message": "Blink verification failed",
                "livenessPassed": False,
                "blinkDetected": False,
                "blinkSignals": blink_result["signals"],
            }
        ), 403

    stored = faces_col.find_one({"userId": user_id})

    if not stored:
        return jsonify({"success": False, "message": "Face not registered"}), 404

    stored_embedding = normalize_embedding(stored["embedding"])

    scores = [
        cosine_similarity(normalize_embedding(face.embedding), stored_embedding)
        for face in blink_result["faces"]
    ]

    score = max(scores)
    matched = score >= MATCH_THRESHOLD

    print(f"Face verification: userId={user_id}, similarity={score}, matched={matched}")

    return jsonify(
        {
            "success": matched,
            "matched": matched,
            "confidence": score,
            "livenessPassed": True,
            "blinkDetected": True,
            "blinkSignals": blink_result["signals"],
        }
    ), (200 if matched else 403)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)
