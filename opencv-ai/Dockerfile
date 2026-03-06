FROM python:3.10-slim

WORKDIR /app
ENV INSIGHTFACE_HOME=/root/.insightface

RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download InsightFace model during image build so runtime healthcheck does not fail
# while the container is fetching model assets on first boot.
RUN python -c "from insightface.app import FaceAnalysis; app = FaceAnalysis(name='buffalo_l', providers=['CPUExecutionProvider']); app.prepare(ctx_id=0, det_size=(640, 640)); print('InsightFace model cached')"

COPY . .

EXPOSE 8000

CMD ["python", "verify_service.py"]
