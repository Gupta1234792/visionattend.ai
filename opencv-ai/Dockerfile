FROM python:3.10-slim-bookworm

WORKDIR /app

ENV INSIGHTFACE_HOME=/root/.insightface
ENV PIP_PREFER_BINARY=1

RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    ffmpeg \
    git \
    wget \
    unzip \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

COPY . .

# Pre-download the InsightFace model during build to avoid startup timeout
RUN mkdir -p /root/.insightface/models/buffalo_l && \
    cd /root/.insightface/models && \
    wget -O buffalo_l.zip https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip && \
    unzip -o buffalo_l.zip -d /root/.insightface/models/buffalo_l && \
    test -f /root/.insightface/models/buffalo_l/det_10g.onnx && \
    rm buffalo_l.zip

EXPOSE 10000

CMD ["gunicorn", "--timeout", "600", "--workers", "1", "--bind", "0.0.0.0:10000", "main:app"]
