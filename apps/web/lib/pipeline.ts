import { deleteHosted, hostImage } from "./blob";
import { recordMatch } from "./chain";
import { env } from "./env";
import { errorMessage } from "./errors";
import { detect, toFaceBox } from "./face";
import { scoreCandidate } from "./verify";
import { faceHash } from "./hash";
import { prepareImage } from "./image";
import { createJob, deleteJob, newJobId } from "./jobs";
import { searchCandidates } from "./search";
import type {
  Candidate,
  PipelineResult,
  Stage,
  StageEvent,
  VerifiedCandidate,
} from "./types";

export interface PipelineInput {
  bytes: Uint8Array;
  mime: string;
  filename?: string;
}

export interface PipelineOptions {
  // Skip the on-chain write (CLI `--no-chain`); outcome becomes "dry_run" when matches exist.
  skipChain?: boolean;
}

export type Emit = (event: StageEvent) => void;

const VERIFY_CONCURRENCY = 3;

/** Run `worker` over `items` with a fixed number of in-flight tasks, preserving order. */
async function pool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

async function verifyCandidates(
  embedding: number[],
  candidates: Candidate[],
): Promise<VerifiedCandidate[]> {
  const scored = await pool(candidates, VERIFY_CONCURRENCY, (candidate) => scoreCandidate(embedding, candidate));
  return scored
    .filter((c): c is VerifiedCandidate => c !== null)
    .sort((a, b) => b.similarity - a.similarity);
}

/**
 * upload -> detect -> search -> verify -> record. Emits one `start` and one terminal
 * event per stage, always cleans up the hosted blob and the in-memory job, and never
 * exposes the embedding.
 */
export async function runPipeline(
  input: PipelineInput,
  emit: Emit,
  options: PipelineOptions = {},
): Promise<PipelineResult> {
  const jobId = newJobId();
  const result: PipelineResult = { jobId, outcome: "error", candidates: [], matches: [] };
  let hostedUrl: string | null = null;
  let stage: Stage = "upload";

  try {
    emit({ stage: "upload", status: "start" });
    const image = await prepareImage(input.bytes, input.mime);
    result.imageHash = image.imageHash;
    const hosted = await hostImage(image.bytes, jobId);
    hostedUrl = hosted.url;
    emit({
      stage: "upload",
      status: "ok",
      payload: { jobId, imageHash: image.imageHash, width: image.width, height: image.height },
    });

    stage = "detect";
    emit({ stage: "detect", status: "start" });
    const detection = await detect(image.bytes, input.filename ?? "upload.jpg");
    if (!detection) {
      emit({ stage: "detect", status: "error", message: "No face found" });
      result.outcome = "no_face";
      result.error = "No face found";
      return result;
    }
    const face = detection.faces[0];
    const embedding = face.embedding;
    createJob(embedding, image.imageHash, jobId);
    const box = toFaceBox(face.bbox);
    const fHash = faceHash(embedding);
    result.faceHash = fHash;
    result.box = box;
    emit({
      stage: "detect",
      status: "ok",
      payload: { faceHash: fHash, box, detScore: face.det_score, faceCount: detection.faces.length },
    });

    stage = "search";
    emit({ stage: "search", status: "start" });
    const { provider, candidates } = await searchCandidates(hosted.url);
    result.candidates = candidates;
    emit({ stage: "search", status: "ok", payload: { provider, candidates } });
    if (candidates.length === 0) {
      emit({ stage: "verify", status: "skipped", message: "No candidates to verify" });
      emit({ stage: "record", status: "skipped", message: "Nothing to seal" });
      result.outcome = "no_matches";
      return result;
    }

    stage = "verify";
    emit({ stage: "verify", status: "start" });
    const threshold = env.FACE_SIMILARITY_THRESHOLD;
    const scored = await verifyCandidates(embedding, candidates);
    const matches = scored.filter((c) => c.similarity >= threshold);
    result.matches = matches;
    result.best = matches[0];
    emit({
      stage: "verify",
      status: "ok",
      payload: { matches, rejected: candidates.length - matches.length, threshold, scored },
    });
    if (matches.length === 0) {
      emit({ stage: "record", status: "skipped", message: "Nothing to seal" });
      result.outcome = "no_matches";
      return result;
    }

    stage = "record";
    if (options.skipChain) {
      emit({ stage: "record", status: "skipped", message: "chain write disabled (--no-chain)" });
      result.outcome = "dry_run";
      return result;
    }
    emit({ stage: "record", status: "start" });
    try {
      const receipt = await recordMatch({
        imageHash: image.imageHash,
        faceHash: fHash,
        postUrl: matches[0].url,
      });
      result.receipt = receipt;
      result.outcome = "sealed";
      emit({ stage: "record", status: "ok", payload: receipt });
    } catch (e) {
      const message = errorMessage(e);
      emit({ stage: "record", status: "error", message });
      result.outcome = "chain_error";
      result.error = message;
    }
    return result;
  } catch (e) {
    const message = errorMessage(e);
    emit({ stage, status: "error", message });
    result.outcome = "error";
    result.error = message;
    return result;
  } finally {
    await deleteHosted(hostedUrl);
    deleteJob(jobId);
    const failed = result.outcome === "error" || result.outcome === "chain_error";
    emit({ stage: "done", status: failed ? "error" : "ok", result });
  }
}
