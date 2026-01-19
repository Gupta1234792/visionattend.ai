def head_left(landmarks):
    return landmarks[1].x < 0.45

def head_right(landmarks):
    return landmarks[1].x > 0.55

def head_up(landmarks):
    return landmarks[1].y < 0.45
