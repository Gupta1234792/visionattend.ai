import base64
import os
import time

import cv2
import numpy as np
from flask import Flask, jsonify, request
from insightface.app import FaceAnalysis

from utils.mongo import faces as faces_col

app = Flask(__name__)

MATCH_THRESHOLD = float(os.getenv("MATCH_THRESHOLD", "0.65"))
REGISTER_THRESHOLD = float(os.getenv("REGISTER_THRESHOLD", "0.70"))
LIVENESS_MIN_FRAMES = max(6, int(os.getenv("LIVENESS_MIN_FRAMES", "6")))
BLINK_MIN_DROP = float(os.getenv("BLINK_MIN_DROP", "0.035"))
BLINK_RECOVERY_DROP = float(os.getenv("BLINK_RECOVERY_DROP", "0.020"))

arcface = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
arcface.prepare(ctx_id=-1, det_size=(640, 640))


def decode_image_payload(image_value):
    if not image_value or not isinstance(image_value, str):
        raise ValueError("Image is required")

    if "," in image_value:
        _, encoded = image_value.split(",", 1)
    else:
        encoded = image_value

    try:
        binary = base64.b64decode(encoded)
    except Exception as exc:
        raise ValueError("Invalid base64 image payload") from exc

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


def extract_single_face(frame):
    detected_faces = arcface.get(frame)
    if not detected_faces:
        return None, "No face detected"
    if len(detected_faces) > 1:
        return None, "Multiple faces detected"
    return detected_faces[0], None


def cosine_similarity(first_embedding, second_embedding):
    norm_a = np.linalg.norm(first_embedding)
    norm_b = np.linalg.norm(second_embedding)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(first_embedding, second_embedding) / (norm_a * norm_b))


def registration_quality(face, frame):
    det_score = float(getattr(face, "det_score", 0.0) or 0.0)
    bbox = np.array(face.bbox).astype(np.float32)
    width = max(1.0, float(bbox[2] - bbox[0]))
    height = max(1.0, float(bbox[3] - bbox[1]))
    face_area_ratio = min(1.0, (width * height) / float(frame.shape[0] * frame.shape[1]))
    size_score = min(1.0, face_area_ratio * 8.0)
    return float(round((det_score * 0.7) + (size_score * 0.3), 4))


def crop_eye_region(frame, eye_point, eye_distance):
    half_w = max(8, int(eye_distance * 0.18))
    half_h = max(6, int(eye_distance * 0.12))
    center_x = int(eye_point[0])
    center_y = int(eye_point[1])

    left = max(0, center_x - half_w)
    right = min(frame.shape[1], center_x + half_w)
    top = max(0, center_y - half_h)
    bottom = min(frame.shape[0], center_y + half_h)

    if right - left < 8 or bottom - top < 6:
        return None
    return frame[top:bottom, left:right]


def eye_openness_proxy(frame, keypoints):
    if keypoints is None or len(keypoints) < 2:
        return None

    left_eye = np.array(keypoints[0], dtype=np.float32)
    right_eye = np.array(keypoints[1], dtype=np.float32)
    eye_distance = float(np.linalg.norm(right_eye - left_eye))
    if eye_distance < 12.0:
        return None

    eye_scores = []
    for eye_point in (left_eye, right_eye):
        roi = crop_eye_region(frame, eye_point, eye_distance)
        if roi is None:
            return None

        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        gray = cv2.GaussianBlur(gray, (3, 3), 0)
        gray = cv2.equalizeHist(gray)

        dark_threshold = float(np.percentile(gray, 40))
        dark_ratio = float(np.mean(gray <= dark_threshold))
        contrast_score = float(np.std(gray) / 128.0)
        eye_scores.append((dark_ratio * 0.75) + (contrast_score * 0.25))

    return float(np.mean(eye_scores))


def analyze_blink_sequence(frames):
    faces = []
    signals = []

    for frame in frames:
        face, error_message = extract_single_face(frame)
        if error_message:
            return {
                "ok": False,
                "message": error_message,
                "signals": signals,
                "faces": faces,
            }

        signal = eye_openness_proxy(frame, getattr(face, "kps", None))
        if signal is None:
            return {
                "ok": False,
                "message": "Eye landmarks not detected clearly. Keep face straight and retry.",
                "signals": signals,
                "faces": faces,
            }

        faces.append(face)
        signals.append(signal)

    min_index = int(np.argmin(signals))
    min_signal = float(signals[min_index])
    before_open = max(signals[:min_index], default=min_signal)
    after_open = max(signals[min_index + 1 :], default=min_signal)
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
        "message": "Blink detected" if blink_detected else "Blink not detected. Keep face steady and blink once.",
        "signals": [round(value, 4) for value in signals],
        "faces": faces,
        "blinkIndex": min_index,
        "blinkDrop": round(blink_drop, 4),
    }


@app.get("/")
def home():
    return {"success": True, "message": "VisionAttend OpenCV service running"}


@app.get("/health")
def health():
    return {
        "success": True,
        "status": "healthy",
        "matchThreshold": MATCH_THRESHOLD,
        "livenessMinFrames": LIVENESS_MIN_FRAMES,
    }


@app.post("/register")
def register_face():
    payload = request.get_json(silent=True) or {}
    user_id = str(payload.get("userId") or "").strip()
    image_value = payload.get("image")

    if not user_id:
        return jsonify({"success": False, "message": "userId is required"}), 400

    try:
        frame = decode_image_payload(image_value)
    except ValueError as exc:
        return jsonify({"success": False, "message": str(exc)}), 400

    face, error_message = extract_single_face(frame)
    if error_message:
        return jsonify({"success": False, "message": error_message}), 400

    confidence = registration_quality(face, frame)
    if confidence < REGISTER_THRESHOLD:
        return (
            jsonify(
                {
                    "success": False,
                    "message": "Face quality too low. Keep face centered and retry.",
                    "confidence": confidence,
                }
            ),
            403,
        )

    embedding = face.embedding
    now = time.time()
    faces_col.delete_many({"userId": user_id})
    faces_col.insert_one(
        {
            "userId": user_id,
            "collegeId": str(payload.get("collegeId") or ""),
            "departmentId": str(payload.get("departmentId") or ""),
            "year": str(payload.get("year") or ""),
            "division": str(payload.get("division") or ""),
            "embedding": embedding.tolist(),
            "model": "arcface_buffalo_l",
            "dim": int(len(embedding)),
            "createdAt": now,
            "updatedAt": now,
        }
    )

    return jsonify(
        {
            "success": True,
            "message": "Face registered",
            "matched": True,
            "confidence": confidence,
        }
    )


@app.post("/verify")
def verify_face():
    payload = request.get_json(silent=True) or {}
    user_id = str(payload.get("userId") or "").strip()
    frames_value = payload.get("frames")

    if not user_id:
        return jsonify({"success": False, "message": "userId is required"}), 400

    try:
        frames = decode_frame_sequence(frames_value)
    except ValueError as exc:
        return jsonify({"success": False, "message": str(exc)}), 400

    blink_result = analyze_blink_sequence(frames)
    if not blink_result["ok"]:
        return (
            jsonify(
                {
                    "success": False,
                    "matched": False,
                    "confidence": 0.0,
                    "livenessPassed": False,
                    "blinkDetected": False,
                    "blinkSignals": blink_result["signals"],
                    "message": blink_result["message"],
                }
            ),
            403,
        )

    stored_face = faces_col.find_one({"userId": user_id})
    if not stored_face or "embedding" not in stored_face:
        return jsonify({"success": False, "message": "Face not registered"}), 404

    stored_embedding = np.array(stored_face["embedding"], dtype=np.float32)
    scores = [cosine_similarity(face.embedding, stored_embedding) for face in blink_result["faces"]]
    score = max(scores) if scores else 0.0
    matched = score >= MATCH_THRESHOLD

    response_code = 200 if matched else 403
    return (
        jsonify(
            {
                "success": matched,
                "matched": matched,
                "confidence": score,
                "livenessPassed": True,
                "blinkDetected": True,
                "blinkSignals": blink_result["signals"],
                "blinkDrop": blink_result["blinkDrop"],
                "message": "Face matched" if matched else "Face not recognized",
            }
        ),
        response_code,
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=10000)
