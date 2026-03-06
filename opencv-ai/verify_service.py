import os
import json
import base64
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

import cv2
import numpy as np
from dotenv import load_dotenv
from insightface.app import FaceAnalysis

from utils.mongo import faces

load_dotenv()

HOST = os.getenv("OPENCV_VERIFY_HOST", "0.0.0.0")
PORT = int(os.getenv("OPENCV_VERIFY_PORT", os.getenv("PORT", "8001")))
MATCH_THRESHOLD = float(os.getenv("MATCH_THRESHOLD", "0.65"))

arc = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
arc.prepare(ctx_id=0, det_size=(640, 640))


def cosine(a, b):
    denom = float(np.linalg.norm(a) * np.linalg.norm(b))
    if denom == 0:
        return 0.0
    return float(np.dot(a, b) / denom)


def decode_image_from_dataurl(data_url: str):
    if not data_url or "," not in data_url:
        return None
    try:
        encoded = data_url.split(",", 1)[1]
        img_bytes = base64.b64decode(encoded)
        arr = np.frombuffer(img_bytes, dtype=np.uint8)
        return cv2.imdecode(arr, cv2.IMREAD_COLOR)
    except Exception:
        return None


class VerifyHandler(BaseHTTPRequestHandler):
    def _send(self, status, payload):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode("utf-8"))

    def do_POST(self):
        if self.path not in ("/verify", "/register"):
            return self._send(404, {"success": False, "message": "Not found"})

        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length)
            payload = json.loads(body.decode("utf-8"))
        except Exception:
            return self._send(400, {"success": False, "message": "Invalid JSON"})

        user_id = str(payload.get("userId") or "").strip()
        subject_id = str(payload.get("subjectId") or "").strip()
        college_id = str(payload.get("collegeId") or "").strip()
        department_id = str(payload.get("departmentId") or "").strip()
        year = str(payload.get("year") or "").strip()
        division = str(payload.get("division") or "").strip()
        image_data = payload.get("image")

        if not user_id or not image_data:
            return self._send(400, {
                "success": False,
                "matched": False,
                "message": "userId and image are required"
            })

        frame = decode_image_from_dataurl(str(image_data))
        if frame is None:
            return self._send(400, {"success": False, "matched": False, "message": "Invalid image payload"})

        detections = arc.get(frame)
        if len(detections) != 1:
            return self._send(200, {
                "success": False,
                "matched": False,
                "confidence": 0.0,
                "message": "Show exactly one face"
            })

        emb = detections[0].embedding

        if self.path == "/register":
            faces.delete_many({"userId": user_id})
            faces.insert_one({
                "userId": user_id,
                "subjectId": "GLOBAL",
                "collegeId": college_id or None,
                "departmentId": department_id or None,
                "year": year or None,
                "division": division or None,
                "embedding": emb.tolist(),
                "model": "arcface_buffalo_l",
                "updatedAt": int(time.time())
            })
            return self._send(200, {
                "success": True,
                "matched": True,
                "confidence": 1.0,
                "message": "Face registered"
            })

        if not subject_id:
            return self._send(400, {
                "success": False,
                "matched": False,
                "message": "subjectId is required for verification"
            })

        enrolled = list(faces.find({"userId": user_id}))
        if not enrolled:
            return self._send(200, {
                "success": False,
                "matched": False,
                "confidence": 0.0,
                "message": "No enrolled face for this user"
            })

        best_score = 0.0
        for doc in enrolled:
            db_emb = np.array(doc.get("embedding", []), dtype=np.float32)
            if db_emb.size == 0:
                continue
            score = cosine(emb, db_emb)
            if score > best_score:
                best_score = score

        matched = best_score >= MATCH_THRESHOLD
        return self._send(200, {
            "success": matched,
            "matched": matched,
            "confidence": float(best_score),
            "threshold": MATCH_THRESHOLD
        })

    def do_GET(self):
        if self.path == "/health":
            return self._send(200, {
                "success": True,
                "message": "opencv verify service healthy",
                "threshold": MATCH_THRESHOLD
            })
        return self._send(404, {"success": False, "message": "Not found"})


if __name__ == "__main__":
    server = HTTPServer((HOST, PORT), VerifyHandler)
    print(f"OpenCV service running on http://{HOST}:{PORT}/verify and /register")
    server.serve_forever()
