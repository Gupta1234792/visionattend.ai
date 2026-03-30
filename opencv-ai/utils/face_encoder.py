from insightface.app import FaceAnalysis
import numpy as np
import os

# 🔥 FIX: explicit root= — no runtime download
_MODEL_ROOT = os.getenv("INSIGHTFACE_HOME", "/root/.insightface")

arcface = FaceAnalysis(
    name="buffalo_l",
    root=_MODEL_ROOT,
    providers=["CPUExecutionProvider"]
)
arcface.prepare(ctx_id=-1, det_size=(640, 640))
print("[face_encoder] InsightFace ready ✅ root=", _MODEL_ROOT)


def get_embedding(frame):
    faces = arcface.get(frame)
    if len(faces) != 1:
        return None
    return faces[0].embedding


def cosine(a, b):
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))