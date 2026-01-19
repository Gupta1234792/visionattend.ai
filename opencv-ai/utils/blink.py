def eye_blink(landmarks):
    return abs(landmarks[159].y - landmarks[145].y)
