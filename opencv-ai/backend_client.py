import os
from dotenv import load_dotenv
import requests

load_dotenv()

BACKEND_URL = "http://localhost:5000/api/attendance/face"
OPENCV_API_KEY = os.getenv("OPENCV_API_KEY")

def mark_face_attendance(user_id, subject_id, confidence):
    payload = {
        "userId": user_id,
        "subjectId": subject_id,
        "confidence": confidence
    }

    headers = {
       "x-opencv-key": "visionattend-opencv-2026@secure"
    }

    res = requests.post(BACKEND_URL, json=payload, headers=headers, timeout=5)
    return res.json()
