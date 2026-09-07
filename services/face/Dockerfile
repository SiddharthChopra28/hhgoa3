FROM python:3.11-slim

WORKDIR /app

# insightface/onnxruntime build & runtime needs: build-essential + cython for
# native extensions, libgl/libglib for opencv (an insightface dependency).
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libgl1 \
        libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir cython && \
    pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Pre-download and warm the buffalo_l model at build time so the first
# request doesn't pay for the model download / init.
RUN python -c "from insightface.app import FaceAnalysis; \
    fa = FaceAnalysis(name='buffalo_l', providers=['CPUExecutionProvider']); \
    fa.prepare(ctx_id=-1, det_size=(640, 640))"

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
