import { compare } from "./face";
import { errorMessage } from "./errors";
import type { Candidate, VerifiedCandidate } from "./types";

/**
 * Score one candidate against the stored embedding. Full-size image first (thumbnails
 * shrink faces below what ArcFace needs); thumbnail only if the image yields no face.
 * Returns null when nothing could be compared.
 */
export async function scoreCandidate(embedding: number[], candidate: Candidate): Promise<VerifiedCandidate | null> {
  const sources = [candidate.image, candidate.thumbnail].filter((u): u is string => !!u);
  if (sources.length === 0) return null;
  let best: number | null = null;
  for (const source of sources) {
    try {
      const { similarity, faces } = await compare(embedding, source);
      if (faces > 0) {
        best = best === null ? similarity : Math.max(best, similarity);
        break;
      }
    } catch (e) {
      console.warn(`[verify] ${source}: ${errorMessage(e)}`);
    }
  }
  return best === null ? null : { ...candidate, similarity: best };
}
