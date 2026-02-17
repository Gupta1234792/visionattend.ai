import os
import requests
from dotenv import load_dotenv

load_dotenv()

BACKEND_URL = os.getenv("BACKEND_FACE_URL", "http://localhost:5000/api/attendance/face")
BACKEND_FACE_REGISTER_URL = os.getenv("BACKEND_FACE_REGISTER_URL", "http://localhost:5000/api/students/face-register/confirm")
OPENCV_API_KEY = os.getenv("OPENCV_API_KEY")


def mark_face_attendance(user_id, subject_id, confidence):
    if not OPENCV_API_KEY:
        return {
            "success": False,
            "error": "OPENCV_API_KEY not configured"
        }

    payload = {
        "userId": user_id,
        "subjectId": subject_id,
        "confidence": confidence
    }

    headers = {
        "x-opencv-key": OPENCV_API_KEY
    }

    try:
        res = requests.post(
            BACKEND_URL,
            json=payload,
            headers=headers,
            timeout=5
        )
        return res.json()
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


def confirm_face_registration(user_id, confidence=0.99):
    if not OPENCV_API_KEY:
        return {
            "success": False,
            "error": "OPENCV_API_KEY not configured"
        }

    payload = {
        "userId": user_id,
        "confidence": confidence
    }

    headers = {
        "x-opencv-key": OPENCV_API_KEY
    }

    try:
        res = requests.post(
            BACKEND_FACE_REGISTER_URL,
            json=payload,
            headers=headers,
            timeout=5
        )
        return res.json()
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }
