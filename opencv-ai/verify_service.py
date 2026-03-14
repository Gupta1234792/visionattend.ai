import os

from main import app


if __name__ == "__main__":
    host = os.getenv("OPENCV_VERIFY_HOST", "0.0.0.0")
    port = int(os.getenv("OPENCV_VERIFY_PORT", os.getenv("PORT", "10000")))
    app.run(host=host, port=port)
