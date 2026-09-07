// Shared types for the pipeline, route handlers, CLI and UI. Keep in sync with services/face.
import type { Hex } from "viem";

export type Platform =
  | "instagram"
  | "x"
  | "facebook"
  | "reddit"
  | "linkedin"
  | "threads"
  | "tiktok"
  | "pinterest"
  | "other";

export type SearchProvider = "google_lens" | "tineye";

// Pixel box in the coordinate space of the resized image (max side 1024).
export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Candidate {
  url: string;
  platform: Platform;
  thumbnail?: string;
  title?: string;
  provider: SearchProvider;
}

export interface VerifiedCandidate extends Candidate {
  similarity: number; // cosine similarity in [-1, 1]
}

export interface ChainReceipt {
  chainId: number;
  contractAddress: Hex;
  txHash: Hex;
  blockNumber: string; // bigint as decimal string for JSON safety
  explorerTxUrl: string;
  explorerContractUrl: string;
  gasCostWei?: string;
}

export interface OnChainRecord {
  imageHash: Hex;
  faceHash: Hex;
  postUrl: string;
  timestamp: number; // unix seconds
  submitter: Hex;
}

export type Stage = "upload" | "detect" | "search" | "verify" | "record";
export type StageStatus = "start" | "ok" | "error" | "skipped";

export interface UploadPayload {
  jobId: string;
  imageHash: Hex;
  width: number;
  height: number;
}

export interface DetectPayload {
  faceHash: Hex;
  box: FaceBox;
  detScore: number;
  faceCount: number;
}

export interface SearchPayload {
  provider: SearchProvider;
  candidates: Candidate[];
}

export interface VerifyPayload {
  matches: VerifiedCandidate[]; // similarity >= threshold, sorted desc
  rejected: number;
  threshold: number;
}

export type RecordPayload = ChainReceipt;

export type StagePayloadMap = {
  upload: UploadPayload;
  detect: DetectPayload;
  search: SearchPayload;
  verify: VerifyPayload;
  record: RecordPayload;
};

export type Outcome = "sealed" | "no_face" | "no_matches" | "chain_error" | "dry_run" | "error";

export interface PipelineResult {
  jobId: string;
  outcome: Outcome;
  imageHash?: Hex;
  faceHash?: Hex;
  box?: FaceBox;
  candidates: Candidate[];
  matches: VerifiedCandidate[];
  best?: VerifiedCandidate;
  receipt?: ChainReceipt;
  error?: string;
}

// One SSE event. `done` carries the final PipelineResult in `result`.
export type StageEvent =
  | { stage: "upload"; status: "start" }
  | { stage: "upload"; status: "ok"; payload: UploadPayload }
  | { stage: "detect"; status: "start" }
  | { stage: "detect"; status: "ok"; payload: DetectPayload }
  | { stage: "search"; status: "start" }
  | { stage: "search"; status: "ok"; payload: SearchPayload }
  | { stage: "verify"; status: "start" }
  | { stage: "verify"; status: "ok"; payload: VerifyPayload }
  | { stage: "record"; status: "start" }
  | { stage: "record"; status: "ok"; payload: RecordPayload }
  | { stage: Stage; status: "error"; message: string }
  | { stage: Stage; status: "skipped"; message: string }
  | { stage: "done"; status: "ok" | "error"; result: PipelineResult };

export interface VerifyExistingResult {
  imageHash: Hex;
  found: boolean;
  record?: OnChainRecord;
  explorerContractUrl: string;
  chainId: number;
}

// Face service wire format (services/face).
export interface FaceServiceFace {
  bbox: [number, number, number, number]; // x1, y1, x2, y2
  det_score: number;
  embedding: number[]; // 512 floats
}
export interface FaceServiceDetectResponse {
  faces: FaceServiceFace[]; // largest face first
  width: number;
  height: number;
}
export interface FaceServiceCompareResponse {
  similarity: number;
  faces: number;
}
