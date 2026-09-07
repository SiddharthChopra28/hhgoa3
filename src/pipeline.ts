import { randomUUID } from 'node:crypto';
import { CONFIG, isImageType } from './lib/config.js';
import { keccakBytes } from './lib/hash.js';
import { dHash, hammingDistance } from './lib/image.js';
import { detectFace, compareFace } from './lib/face.js';
import { hostImage } from './lib/host.js';
import { searchAll, isSocialDomain, type Candidate } from './lib/search.js';
import { buildEvidence, type Evidence } from './lib/manifest.js';
import { fetchBytes, extractOgImage } from './lib/fetch.js';
import { recordEvidence, readEvidence, explorerUrl, loadDeployment } from './lib/chain.js';

export type Stage = 'detect' | 'host' | 'search' | 'verify' | 'record' | 'readback' | 'done';

export interface PipelineEvent {
  stage: Stage;
  status: 'start' | 'progress' | 'ok' | 'error' | 'info';
  payload?: Record<string, unknown>;
}

export type Emit = (event: PipelineEvent) => void;

function sanitize(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = sanitize(v);
    return out;
  }
  return value;
}

export interface VerifiedCandidate {
  provider: string;
  pageUrl: string;
  imageUrl?: string;
  title?: string;
  source?: string;
  isSocial: boolean;
  candidateImageHash?: string;
  faceSimilarity: number;
  perceptualDistance: number | null;
  fetched: boolean;
  fetchError?: string;
}

export interface PipelineResult {
  jobId: string;
  status: 'matched' | 'no_face' | 'no_match' | 'chain_error' | 'error';
  sourceImageHash?: string;
  faceScore?: number;
  hostUrl?: string;
  hostProvider?: string;
  perProvider?: Record<string, number>;
  candidates: VerifiedCandidate[];
  best?: VerifiedCandidate;
  evidence?: Evidence;
  txHash?: string;
  blockNumber?: bigint;
  chainId?: number;
  contractAddress?: string;
  explorerUrl?: string;
  onChainRecord?: unknown;
  error?: string;
}

export async function runPipeline(input: { buffer: Uint8Array; filename: string; mime?: string }, emit: Emit): Promise<PipelineResult> {
  const result: PipelineResult = { jobId: randomUUID(), status: 'error', candidates: [] };
  const noop = () => {};
  const log: Emit = emit || noop;

  try {
    if (input.buffer.length > CONFIG.maxImageBytes) {
      throw new Error(`Image too large (${input.buffer.length} bytes, max ${CONFIG.maxImageBytes})`);
    }
    if (input.mime && !isImageType(input.mime)) {
      throw new Error(`Unsupported image type: ${input.mime}`);
    }

    result.sourceImageHash = keccakBytes(input.buffer);
    const sourcePerceptual = await dHash(input.buffer);

    // Stage 1: face detection + encoding
    log({ stage: 'detect', status: 'start', payload: {} });
    const detection = await detectFace(input.buffer, CONFIG.faceDetectMinConfidence);
    if (!detection) {
      log({ stage: 'detect', status: 'info', payload: { message: 'No face detected' } });
      result.status = 'no_face';
      return result;
    }
    result.faceScore = Math.round(detection.best.score * 10000) / 10000;
    log({
      stage: 'detect',
      status: 'ok',
      payload: {
        faces: detection.faces.length,
        bestScore: detection.best.score,
        box: detection.best.box,
        descriptorDim: detection.best.descriptor.length,
      },
    });
    const referenceDescriptor = detection.best.descriptor;

    // Stage 2: temporary public hosting (needed by reverse-image-search APIs)
    log({ stage: 'host', status: 'start', payload: {} });
    const hosted = await hostImage(input.buffer, input.filename || `face-${result.jobId}.jpg`);
    result.hostUrl = hosted.url;
    result.hostProvider = hosted.provider;
    log({ stage: 'host', status: 'ok', payload: { url: hosted.url, provider: hosted.provider } });

    // Stage 3: reverse image search (Google Lens + Yandex)
    log({ stage: 'search', status: 'start', payload: {} });
    const { candidates, perProvider } = await searchAll(hosted.url);
    result.perProvider = perProvider;
    log({ stage: 'search', status: 'ok', payload: { total: candidates.length, perProvider } });
    if (candidates.length === 0) {
      result.status = 'no_match';
      log({ stage: 'search', status: 'info', payload: { message: 'No candidates returned by any provider' } });
      return result;
    }

    // Stage 4: verify candidates (fetch image bytes, hash, face + perceptual compare)
    log({ stage: 'verify', status: 'start', payload: { candidates: candidates.length } });
    const verified: VerifiedCandidate[] = [];
    for (const c of candidates.slice(0, CONFIG.maxCandidates)) {
      const item: VerifiedCandidate = {
        provider: c.provider,
        pageUrl: c.pageUrl,
        imageUrl: c.imageUrl,
        title: c.title,
        source: c.source,
        isSocial: isSocialDomain(c.pageUrl),
        faceSimilarity: 0,
        perceptualDistance: null,
        fetched: false,
      };
      let bytes: Uint8Array | undefined;
      try {
        const urls = [c.imageUrl, c.thumbnail].filter((u): u is string => !!u && u.startsWith('http'));
        for (const u of urls) {
          try {
            bytes = await fetchBytes(u);
            break;
          } catch {
            /* try next */
          }
        }
        if (!bytes && c.pageUrl.startsWith('http')) {
          const og = await extractOgImage(c.pageUrl);
          if (og) bytes = await fetchBytes(og);
        }
        if (!bytes) {
          item.fetchError = 'candidate image not fetchable';
        } else {
          item.fetched = true;
          item.candidateImageHash = keccakBytes(bytes);
          try {
            item.perceptualDistance = hammingDistance(sourcePerceptual, await dHash(bytes));
          } catch {
            item.perceptualDistance = null;
          }
          item.faceSimilarity = await compareFace(bytes, referenceDescriptor, CONFIG.faceDetectMinConfidence);
        }
      } catch (e) {
        item.fetchError = (e as Error).message;
      }
      verified.push(item);
      log({
        stage: 'verify',
        status: 'progress',
        payload: {
          index: verified.length,
          pageUrl: item.pageUrl,
          provider: item.provider,
          isSocial: item.isSocial,
          faceSimilarity: Math.round(item.faceSimilarity * 10000) / 10000,
          perceptualDistance: item.perceptualDistance,
          fetched: item.fetched,
        },
      });
    }
    result.candidates = verified;

    const passing = verified.filter((v) => v.fetched && v.faceSimilarity >= CONFIG.faceSimilarityThreshold);
    const best = passing.sort((a, b) => {
      if (a.isSocial !== b.isSocial) return a.isSocial ? -1 : 1;
      return b.faceSimilarity - a.faceSimilarity;
    })[0];

    if (!best) {
      result.status = 'no_match';
      log({ stage: 'verify', status: 'info', payload: { message: 'No candidate passed face verification', verified: verified.length } });
      return result;
    }
    result.best = best;
    log({
      stage: 'verify',
      status: 'ok',
      payload: {
        best: { pageUrl: best.pageUrl, provider: best.provider, faceSimilarity: best.faceSimilarity, perceptualDistance: best.perceptualDistance },
        passing: passing.length,
      },
    });

    // Stage 5: build evidence + record on-chain
    const evidence = buildEvidence({
      sourceImageHash: result.sourceImageHash,
      candidateImageHash: best.candidateImageHash!,
      postUrl: best.pageUrl,
      provider: best.provider,
      faceScoreBps: Math.round(best.faceSimilarity * 10000),
      perceptualDistance: best.perceptualDistance ?? -1,
    });
    result.evidence = evidence;

    if (!CONFIG.chainWriteEnabled) {
      log({ stage: 'record', status: 'info', payload: { message: 'chain write disabled (ENABLE_CHAIN=false)', evidenceHash: evidence.manifestHash } });
    } else {
      log({ stage: 'record', status: 'start', payload: { evidenceHash: evidence.manifestHash } });
      const dep = await loadDeployment();
      const tx = await recordEvidence(evidence);
      result.txHash = tx.txHash;
      result.blockNumber = tx.blockNumber;
      result.chainId = tx.chainId;
      result.contractAddress = tx.contractAddress;
      result.explorerUrl = explorerUrl(tx.chainId);
      log({ stage: 'record', status: 'ok', payload: { txHash: tx.txHash, blockNumber: tx.blockNumber.toString(), chainId: tx.chainId, contract: tx.contractAddress } });

      // Stage 6: read back to demonstrate on-chain re-verification
      log({ stage: 'readback', status: 'start', payload: {} });
      const rec = await readEvidence(evidence.manifestHash as `0x${string}`);
      result.onChainRecord = rec;
      log({
        stage: 'readback',
        status: 'ok',
        payload: {
          record: sanitize(rec),
          matchesSource: (rec as { sourceImageHash?: string }).sourceImageHash === result.sourceImageHash,
        },
      });
    }

    result.status = 'matched';
    log({ stage: 'done', status: 'ok', payload: { status: result.status } });
    return result;
  } catch (e) {
    result.error = (e as Error).message;
    result.status = result.status === 'no_face' ? 'no_face' : 'error';
    log({ stage: 'done', status: 'error', payload: { message: result.error } });
    return result;
  }
}
