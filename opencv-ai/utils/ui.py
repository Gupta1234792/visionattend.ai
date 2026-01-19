import cv2

def show_text(frame, text, color=(0,255,0)):
    cv2.putText(
        frame, text, (30,40),
        cv2.FONT_HERSHEY_SIMPLEX,
        1, color, 2
    )
