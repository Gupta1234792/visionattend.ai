FROM python:3.10-slim-bookworm

WORKDIR /app

ENV INSIGHTFACE_HOME=/root/.insightface
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y \
    build-essential \
    g++ \
    cmake \
    libgl1 \
    libglib2.0-0 \
    ffmpeg \
    wget \
    unzip \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN pip install --upgrade pip && \
    pip install --no-cache-dir numpy==1.26.4 && \
    pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /root/.insightface/models/buffalo_l && \
    wget -q -O /tmp/buffalo_l.zip "https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip" && \
    unzip -o /tmp/buffalo_l.zip -d /root/.insightface/models/buffalo_l && \
    rm /tmp/buffalo_l.zip && \
    ls -la /root/.insightface/models/buffalo_l/

RUN python -c "from insightface.app import FaceAnalysis; m = FaceAnalysis(name='buffalo_l', root='/root/.insightface', providers=['CPUExecutionProvider']); m.prepare(ctx_id=-1, det_size=(640,640)); print('Model OK')"

EXPOSE 10000

CMD ["gunicorn", "-b", "0.0.0.0:10000", "--timeout", "120", "--workers", "1", "main:app"]