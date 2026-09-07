"""FastAPI app: face detection, embedding comparison, and hashing endpoints."""
from __future__ import annotations

import io
import json
import math
from contextlib import asynccontextmanager
from typing import Any

import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, Field

from app.fetch import FetchError, fetch_image_bytes
from app.hashing import face_hash, keccak_hex
from app.settings import settings

MODEL_NAME = "buffalo_l"


@asynccontextmanager
async def lifespan(app: FastAPI):
    from insightface.app import FaceAnalysis

    face_app = FaceAnalysis(name=MODEL_NAME, providers=["CPUExecutionProvider"])
    face_app.prepare(ctx_id=settings.ctx_id, det_size=(settings.det_size, settings.det_size))
    app.state.face_app = face_app
    yield
    app.state.face_app = None


app = FastAPI(title="face-encoding-service", lifespan=lifespan)


class CompareRequest(BaseModel):
    embedding: list[float] = Field(...)
    image_url: str


def _decode_image_to_bgr(raw: bytes) -> np.ndarray:
    """Decode arbitrary image bytes to an RGB->BGR numpy array for insightface."""
    try:
        img = Image.open(io.BytesIO(raw))
        img.load()
    except UnidentifiedImageError as exc:
        raise HTTPException(status_code=415, detail="not_an_image") from exc
    except Exception as exc:  # pragma: no cover - PIL raises various decode errors
        raise HTTPException(status_code=415, detail="not_an_image") from exc

    # Honour EXIF orientation so rotated phone photos are detected upright.
    img = ImageOps.exif_transpose(img) or img
    rgb = img.convert("RGB")
    arr = np.array(rgb)  # H, W, 3 in RGB order
    bgr = arr[:, :, ::-1].copy()
    return bgr


def _faces_to_payload(faces: list[Any]) -> list[dict[str, Any]]:
    """Sort faces by bbox area descending and shape the response payload."""

    def area(f: Any) -> float:
        x1, y1, x2, y2 = f.bbox
        return max(0.0, float(x2) - float(x1)) * max(0.0, float(y2) - float(y1))

    ordered = sorted(faces, key=area, reverse=True)
    result = []
    for f in ordered:
        x1, y1, x2, y2 = f.bbox
        result.append(
            {
                "bbox": [int(round(x1)), int(round(y1)), int(round(x2)), int(round(y2))],
                "det_score": float(f.det_score),
                "embedding": [float(v) for v in f.normed_embedding],
            }
        )
    return result


async def _read_upload(file: UploadFile) -> bytes:
    """Read an upload, rejecting it once it exceeds the configured size cap."""
    raw = await file.read(settings.max_image_bytes + 1)
    if len(raw) > settings.max_image_bytes:
        raise HTTPException(status_code=413, detail="file_too_large")
    return raw


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "model": MODEL_NAME}


@app.post("/detect")
async def detect(file: UploadFile = File(...)) -> dict[str, Any]:
    raw = await _read_upload(file)
    bgr = _decode_image_to_bgr(raw)
    height, width = bgr.shape[0], bgr.shape[1]

    face_app = app.state.face_app
    faces = await run_in_threadpool(face_app.get, bgr)

    if not faces:
        raise HTTPException(status_code=422, detail="no_face")

    return {"faces": _faces_to_payload(faces), "width": width, "height": height}


@app.post("/compare")
async def compare(body: CompareRequest) -> dict[str, Any]:
    if len(body.embedding) != 512:
        raise HTTPException(status_code=422, detail="invalid_embedding_length")

    query = np.array(body.embedding, dtype=np.float64)
    query_norm = np.linalg.norm(query)

    try:
        raw = await run_in_threadpool(fetch_image_bytes, body.image_url)
    except FetchError as exc:
        return {"similarity": 0.0, "faces": 0, "error": str(exc)}

    try:
        bgr = _decode_image_to_bgr(raw)
    except HTTPException:
        return {"similarity": 0.0, "faces": 0, "error": "not_an_image"}

    face_app = app.state.face_app
    faces = await run_in_threadpool(face_app.get, bgr)

    if not faces:
        return {"similarity": 0.0, "faces": 0}

    best = 0.0
    for f in faces:
        candidate = np.asarray(f.normed_embedding, dtype=np.float64)
        candidate_norm = np.linalg.norm(candidate)
        if query_norm == 0.0 or candidate_norm == 0.0:
            continue
        cos = float(np.dot(query, candidate) / (query_norm * candidate_norm))
        best = max(best, cos)

    return {"similarity": best, "faces": len(faces)}


@app.post("/hash")
async def hash_endpoint(
    file: UploadFile = File(...), embedding: str | None = Form(default=None)
) -> dict[str, str | None]:
    raw = await _read_upload(file)
    image_hash = keccak_hex(raw)

    face_hash_value: str | None = None
    if embedding is not None:
        try:
            values = json.loads(embedding)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=422, detail="invalid_embedding_json") from exc
        if not isinstance(values, list) or not all(
            isinstance(v, (int, float)) and math.isfinite(v) for v in values
        ):
            raise HTTPException(status_code=422, detail="invalid_embedding_json")
        face_hash_value = face_hash([float(v) for v in values])

    return {"imageHash": image_hash, "faceHash": face_hash_value}
