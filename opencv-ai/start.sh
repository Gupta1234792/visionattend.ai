#!/bin/sh
set -eu

INSIGHT_HOME="${INSIGHTFACE_HOME:-/opt/render/project/src/opencv-ai/.insightface}"
MODEL_DIR="$INSIGHT_HOME/models/buffalo_l"

echo "[STARTUP] INSIGHTFACE_HOME = $INSIGHT_HOME"

# Model download karo agar exist nahi karta
if [ ! -f "$MODEL_DIR/det_10g.onnx" ]; then
    echo "[STARTUP] Model not found — downloading buffalo_l ..."
    mkdir -p "$MODEL_DIR"

    wget --no-check-certificate -q \
        -O /tmp/buffalo_l.zip \
        "https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip"

    unzip -o /tmp/buffalo_l.zip -d "$MODEL_DIR"
    rm -f /tmp/buffalo_l.zip

    echo "[STARTUP] Model downloaded ✅"
    ls -la "$MODEL_DIR"
else
    echo "[STARTUP] Model already exists ✅"
    ls -la "$MODEL_DIR"
fi

PORT_TO_USE="${PORT:-10000}"
echo "[STARTUP] Starting gunicorn on port $PORT_TO_USE ..."
exec gunicorn -b "0.0.0.0:${PORT_TO_USE}" --timeout 120 --workers 1 main:app