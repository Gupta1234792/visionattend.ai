import requests

BACKEND_URL = "http://localhost:5000/api/attendance/face"

def mark_face_attendance(user_id, subject_id, confidence):
    payload = {
        "userId": user_id,        # camelCase OK
        "subjectId": subject_id,  # camelCase OK
        "confidence": confidence
    }

    headers = {
        "x-opencv-key": "visionattend-opencv-2026@secure"
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
