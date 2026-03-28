FROM python:3.10-slim

WORKDIR /app

ENV INSIGHTFACE_HOME=/root/.insightface

RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    ffmpeg \
    wget \
    unzip \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

COPY . .

# 🔥 FIXED MODEL DOWNLOAD
RUN mkdir -p /root/.insightface/models && \
    cd /root/.insightface/models && \
    wget -O buffalo_l.zip https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip && \
    unzip buffalo_l.zip && rm buffalo_l.zip

EXPOSE 10000

# 🔥 USE SIMPLE RUN (NOT GUNICORN)
CMD ["python", "main.py"]