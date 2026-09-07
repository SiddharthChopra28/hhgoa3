import { canonicalJson, keccakString } from './hash.js';

export interface EvidenceManifest {
  version: string;
  sourceImageHash: string;
  candidateImageHash: string;
  postUrl: string;
  provider: string;
  faceModel: string;
  faceScoreBps: number;
  perceptualDistance: number;
  createdAt: string;
}

export interface Evidence {
  manifest: EvidenceManifest;
  manifestHash: string;
}

const FACE_MODEL = process.env.FACE_MODEL || 'face-api.js/tiny_face_detector+face_recognition';
const VERSION = '1';

export function buildEvidence(input: {
  sourceImageHash: string;
  candidateImageHash: string;
  postUrl: string;
  provider: string;
  faceScoreBps: number;
  perceptualDistance: number;
}): Evidence {
  const manifest: EvidenceManifest = {
    version: VERSION,
    sourceImageHash: input.sourceImageHash,
    candidateImageHash: input.candidateImageHash,
    postUrl: input.postUrl,
    provider: input.provider,
    faceModel: FACE_MODEL,
    faceScoreBps: input.faceScoreBps,
    perceptualDistance: input.perceptualDistance,
    createdAt: new Date().toISOString(),
  };
  const manifestHash = keccakString(canonicalJson(manifest));
  return { manifest, manifestHash };
}
