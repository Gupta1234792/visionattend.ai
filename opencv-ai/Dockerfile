FROM python:3.10-slim-bookworm

WORKDIR /app

ENV INSIGHTFACE_HOME=/root/.insightface
ENV PYTHONUNBUFFERED=1

# 🔥 Install ALL required system deps (compiler + runtime)
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

# 🔥 Prevent random version conflicts
RUN pip install --upgrade pip && \
    pip install --no-cache-dir numpy==1.26.4 && \
    pip install --no-cache-dir -r requirements.txt

COPY . .

# 🔥 Pre-download insightface model (VERY IMPORTANT)
RUN mkdir -p /root/.insightface/models && \
    cd /root/.insightface/models && \
    wget -O buffalo_l.zip https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip && \
    unzip buffalo_l.zip && rm buffalo_l.zip

EXPOSE 10000

CMD ["python", "main.py"]