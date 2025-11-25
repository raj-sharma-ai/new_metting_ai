# # FROM python:3.13-slim AS base

# # ENV PYTHONUNBUFFERED=1 \
# #     PYTHONDONTWRITEBYTECODE=1

# # WORKDIR /app

# # RUN apt-get update && \
# #     apt-get install -y --no-install-recommends \
# #         ffmpeg \
# #         build-essential \
# #         libsndfile1 && \
# #     rm -rf /var/lib/apt/lists/*

# # COPY requirements.txt .

# # RUN pip install --upgrade pip && \
# #     pip install --no-cache-dir -r requirements.txt

# # COPY . .

# # RUN adduser --disabled-password --gecos "" appuser && \
# #     chown -R appuser:appuser /app && \
# #     mkdir -p uploads reports recordings && \
# #     chmod -R 755 uploads reports recordings

# # USER appuser

# # EXPOSE 8000

# # CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
















# FROM python:3.13-slim AS base

# ENV PYTHONUNBUFFERED=1 \
#     PYTHONDONTWRITEBYTECODE=1 \
#     HF_HOME="/app/hf" \
#     TRANSFORMERS_OFFLINE=1 \
#     HF_HUB_DISABLE_TELEMETRY=1

# WORKDIR /app

# RUN apt-get update && \
#     apt-get install -y --no-install-recommends \
#         ffmpeg \
#         build-essential \
#         libsndfile1 && \
#     rm -rf /var/lib/apt/lists/*

# COPY requirements.txt .

# RUN pip install --upgrade pip && \
#     pip install --no-cache-dir -r requirements.txt && \
#     rm -rf /root/.cache

# RUN mkdir -p /app/hf

# COPY . .

# # Delete any auto-downloaded model caches
# RUN rm -rf /root/.cache/huggingface

# RUN adduser --disabled-password --gecos "" appuser && \
#     chown -R appuser:appuser /app && \
#     mkdir -p uploads reports recordings && \
#     chmod -R 755 uploads reports recordings

# USER appuser

# EXPOSE 8000

# CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]






FROM python:3.13-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HF_HOME="/app/hf" \
    TRANSFORMERS_OFFLINE=1 \
    HF_HUB_DISABLE_TELEMETRY=1

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ffmpeg \
        build-essential \
        libsndfile1 && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt && \
    rm -rf /root/.cache

# ------------------------------------
#  FIX: Create folders BEFORE copying
# ------------------------------------
RUN mkdir -p /app/uploads /app/recordings /app/reports && \
    chmod -R 777 /app/uploads /app/recordings /app/reports

# HuggingFace folder
RUN mkdir -p /app/hf

# Copy all project files
COPY . .

# Delete auto-downloaded caches
RUN rm -rf /root/.cache/huggingface

# Correct file permissions
RUN adduser --disabled-password --gecos "" appuser && \
    chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

CMD ["uvicorn", "main2:app", "--host", "0.0.0.0", "--port",  "8000"]








