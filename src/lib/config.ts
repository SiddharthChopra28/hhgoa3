export const CONFIG = {
  maxImageBytes: Number(process.env.MAX_IMAGE_BYTES || 15 * 1024 * 1024),
  maxCandidateBytes: Number(process.env.MAX_CANDIDATE_BYTES || 20 * 1024 * 1024),
  faceSimilarityThreshold: Number(process.env.FACE_SIMILARITY_THRESHOLD || 0.5),
  faceDetectMinConfidence: Number(process.env.FACE_DETECT_MIN_CONFIDENCE || 0.4),
  maxPerceptualDistance: Number(process.env.MAX_PERCEPTUAL_DISTANCE || 12),
  maxCandidates: Number(process.env.MAX_CANDIDATES || 15),
  fetchTimeoutMs: Number(process.env.FETCH_TIMEOUT_MS || 15000),
  chainWriteEnabled: (process.env.ENABLE_CHAIN || 'true').toLowerCase() !== 'false',
};

export function isImageType(mime: string | undefined): boolean {
  return !!mime && (mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp' || mime === 'image/gif');
}

// Best-effort SSRF guard: reject obvious loopback/private/link-local hosts.
export function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h === '::1') return true;
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^0\./.test(h)) return true;
  return false;
}
