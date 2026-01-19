from insightface.app import FaceAnalysis
import numpy as np

arcface = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
arcface.prepare(ctx_id=0, det_size=(640, 640))

def get_embedding(frame):
    faces = arcface.get(frame)
    if len(faces) != 1:
        return None
    return faces[0].embedding

def cosine(a, b):
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))
