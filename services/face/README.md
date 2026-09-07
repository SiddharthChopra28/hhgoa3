# face-encoding service

FastAPI microservice wrapping InsightFace `buffalo_l` (SCRFD detector + ArcFace
512-d recognizer) on CPU via onnxruntime.

## Run locally (uv / venv)

```bash
cd services/face
uv venv .venv --python 3.12
uv pip install --python .venv/bin/python -r requirements.txt

# If the insightface wheel fails to build, install cython first, then retry:
uv pip install --python .venv/bin/python cython
uv pip install --python .venv/bin/python -r requirements.txt

.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Config is read from environment variables (see `app/settings.py`), and a
repo-root `.env` is loaded automatically if present:

- `FACE_DET_SIZE` (default `640`)
- `FACE_CTX_ID` (default `-1`, CPU)
- `FACE_FETCH_TIMEOUT_S` (default `15`)
- `FACE_MAX_IMAGE_BYTES` (default `10485760`, 10 MB)
- `PORT` (default `8000`)

## Run tests

```bash
uv pip install --python .venv/bin/python -r requirements-dev.txt
.venv/bin/pytest tests/
```

## Run via Docker

```bash
cd services/face
docker build -t face-service .
docker run -p 8000:8000 face-service
```

The image pre-downloads and warms the `buffalo_l` model at build time, so the
first request after startup doesn't pay for model download/init.

## Smoke test

With the server running on port 8000:

```bash
./smoke.sh
```

Runs `/detect` against `demo/sample1.jpg`, `sample2.jpg`, `sample3.jpg` and
prints status code + face summary for each.

## Endpoints

- `GET /health` -> `{"status": "ok", "model": "buffalo_l"}`
- `POST /detect` — multipart field `file` (an image). Returns detected faces
  (bbox, det_score, 512-d normalized embedding), sorted by bbox area
  descending. 422 `{"detail": "no_face"}` if none found, 413 if the upload
  exceeds `FACE_MAX_IMAGE_BYTES`, 415 if it isn't a decodable image.
- `POST /compare` — JSON body `{"embedding": [512 floats], "image_url": "https://..."}`.
  Downloads the candidate image, detects faces, and returns
  `{"similarity": <max cosine>, "faces": <count>}`. Never raises on a fetch
  failure — a failed download or an image with no face yields
  `{"similarity": 0.0, "faces": 0}` (plus an `"error"` field on fetch
  failure). 422 if `embedding` isn't length 512.
- `POST /hash` — multipart field `file`, optional form field `embedding`
  (a JSON array string). Returns `{"imageHash": "0x...", "faceHash": "0x..." | null}`.
  `imageHash` is the keccak256 of the raw uploaded bytes; `faceHash` is the
  keccak256 of the quantized embedding, matching the Node implementation
  exactly (see `app/hashing.py`).
