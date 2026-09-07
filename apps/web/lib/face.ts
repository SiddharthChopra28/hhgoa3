import type {
  FaceBox,
  FaceServiceCompareResponse,
  FaceServiceDetectResponse,
  FaceServiceFace,
} from "./types";
import { env } from "./env";
import { UpstreamError } from "./errors";

function timeoutSignal(ms: number): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

function base(): string {
  return env.FACE_SERVICE_URL.replace(/\/+$/, "");
}

async function call(path: string, init: RequestInit): Promise<Response> {
  const { signal, done } = timeoutSignal(env.FACE_SERVICE_TIMEOUT_MS);
  try {
    return await fetch(`${base()}${path}`, { ...init, signal });
  } catch (e) {
    const reason = e instanceof Error && e.name === "AbortError" ? "timed out" : String(e);
    throw new UpstreamError("face service", `${path} ${reason}`);
  } finally {
    done();
  }
}

/** Convert the service's [x1,y1,x2,y2] bbox to a positive-extent pixel box. */
export function toFaceBox(bbox: readonly [number, number, number, number]): FaceBox {
  const [x1, y1, x2, y2] = bbox;
  return {
    x: Math.round(Math.min(x1, x2)),
    y: Math.round(Math.min(y1, y2)),
    width: Math.round(Math.abs(x2 - x1)),
    height: Math.round(Math.abs(y2 - y1)),
  };
}

function isFace(v: unknown): v is FaceServiceFace {
  if (typeof v !== "object" || v === null) return false;
  const f = v as Record<string, unknown>;
  return (
    Array.isArray(f.bbox) &&
    f.bbox.length === 4 &&
    f.bbox.every((n) => typeof n === "number") &&
    typeof f.det_score === "number" &&
    Array.isArray(f.embedding) &&
    f.embedding.every((n) => typeof n === "number")
  );
}

/** POST /detect. Returns null when the service reports no face (422). */
export async function detect(bytes: Uint8Array, filename = "upload.jpg"): Promise<FaceServiceDetectResponse | null> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }), filename);
  const res = await call("/detect", { method: "POST", body: form });
  if (res.status === 422) return null;
  if (!res.ok) throw new UpstreamError("face service", `/detect returned ${res.status}`);

  const json: unknown = await res.json();
  if (typeof json !== "object" || json === null) throw new UpstreamError("face service", "malformed /detect response");
  const body = json as Record<string, unknown>;
  const faces = Array.isArray(body.faces) ? body.faces.filter(isFace) : [];
  if (faces.length === 0) return null;
  return {
    faces,
    width: typeof body.width === "number" ? body.width : 0,
    height: typeof body.height === "number" ? body.height : 0,
  };
}

/** POST /compare. Never throws on a candidate that cannot be fetched — the service returns 0. */
export async function compare(embedding: number[], imageUrl: string): Promise<FaceServiceCompareResponse> {
  const res = await call("/compare", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ embedding, image_url: imageUrl }),
  });
  if (!res.ok) throw new UpstreamError("face service", `/compare returned ${res.status}`);
  const json: unknown = await res.json();
  const body = (typeof json === "object" && json !== null ? json : {}) as Record<string, unknown>;
  return {
    similarity: typeof body.similarity === "number" ? body.similarity : 0,
    faces: typeof body.faces === "number" ? body.faces : 0,
    error: typeof body.error === "string" ? body.error : undefined,
  };
}

/** GET /health with a short timeout; false rather than throwing. */
export async function health(timeoutMs = 2000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base()}/health`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
