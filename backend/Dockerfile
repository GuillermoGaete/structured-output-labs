# Hugging Face Space (SDK: docker). Listens on 7860 as HF expects.
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/home/user/.cache/huggingface \
    MODEL_ID=Qwen/Qwen2.5-0.5B-Instruct \
    TORCH_THREADS=2

RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

# HF Spaces run the container as uid 1000; create that user and own the app dir.
RUN useradd -m -u 1000 user
USER user
WORKDIR /home/user/app
ENV PATH="/home/user/.local/bin:${PATH}"

# CPU-only torch keeps the image small (no CUDA libraries).
RUN pip install --user --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

COPY --chown=user requirements.txt .
RUN pip install --user --no-cache-dir -r requirements.txt

COPY --chown=user app ./app

# Owned by `user` so a Docker volume mounted here (docker-compose caches the
# model weights) inherits writable permissions instead of root's.
RUN mkdir -p /home/user/.cache/huggingface

EXPOSE 7860
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
