import cv2
import numpy as np

# ---------- BLINK ----------
def eye_blink(landmarks):
    return abs(landmarks[159].y - landmarks[145].y)

# ---------- HEAD POSE ----------
def head_pose(landmarks):
    left_eye = landmarks[33]
    right_eye = landmarks[263]
    nose = landmarks[1]

    yaw = right_eye.x - left_eye.x
    pitch = nose.y - (left_eye.y + right_eye.y) / 2

    if yaw > 0.06:
        return "LEFT"
    elif yaw < -0.06:
        return "RIGHT"
    elif pitch < -0.04:
        return "UP"
    return "FRONT"

# ---------- VIDEO SPOOF ----------
_prev = None
def motion_score(frame):
    global _prev
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

    if _prev is None:
        _prev = gray
        return 0

    diff = cv2.absdiff(_prev, gray)
    _prev = gray
    return np.mean(diff)
