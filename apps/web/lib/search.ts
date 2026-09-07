import type { Candidate, Platform, SearchProvider } from "./types";
import { env, requireEnv } from "./env";
import { UpstreamError } from "./errors";

export interface SearchResult {
  provider: SearchProvider;
  candidates: Candidate[];
}

const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|igshid$|igsh$|si$)/i;

/** Map a URL's hostname to a supported social platform, or "other". */
export function platformOf(url: string): Platform {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "other";
  }
  const is = (domain: string) => host === domain || host.endsWith(`.${domain}`);
  if (is("instagram.com")) return "instagram";
  if (is("x.com") || is("twitter.com")) return "x";
  if (is("facebook.com") || is("fb.com")) return "facebook";
  if (is("reddit.com")) return "reddit";
  if (is("linkedin.com")) return "linkedin";
  if (is("threads.net") || is("threads.com")) return "threads";
  if (is("tiktok.com")) return "tiktok";
  if (/(^|\.)pinterest\.[a-z.]+$/.test(host)) return "pinterest";
  return "other";
}

/** Canonical form used only for dedupe: lowercase host, no fragment, no tracking params. */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    u.protocol = "https:";
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
    }
    u.searchParams.sort();
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) u.pathname = u.pathname.replace(/\/+$/, "");
    return u.toString();
  } catch {
    return url.trim().toLowerCase();
  }
}

function dedupeAndCap(candidates: Candidate[], cap: number): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const c of candidates) {
    const key = normalizeUrl(c.url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
    if (out.length >= cap) break;
  }
  return out;
}

async function getJson(url: string, init: RequestInit = {}): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.SEARCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    let body: unknown = null;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = { error: text.slice(0, 300) };
    }
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function lensMatchToCandidate(raw: unknown): Candidate | null {
  if (typeof raw !== "object" || raw === null) return null;
  const m = raw as Record<string, unknown>;
  const link = str(m.link);
  if (!link) return null;
  const platform = platformOf(link);
  if (platform === "other") return null;
  return {
    url: link,
    platform,
    thumbnail: str(m.thumbnail),
    title: str(m.title) ?? str(m.source),
    provider: "google_lens",
  };
}

/** SerpApi google_lens. Returns null when the call itself failed (non-2xx or an `error` field). */
async function googleLens(imageUrl: string): Promise<Candidate[] | null> {
  const key = requireEnv("SERPAPI_API_KEY");
  const params = new URLSearchParams({ engine: "google_lens", url: imageUrl, api_key: key });
  const { status, body } = await getJson(`https://serpapi.com/search.json?${params.toString()}`);
  if (status < 200 || status >= 300) return null;
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.error === "string") {
    console.warn(`[search] serpapi error: ${b.error}`);
    return null;
  }
  // exact_matches first: same image, higher confidence than a general visual match.
  const raws = [...asArray(b.exact_matches), ...asArray(b.visual_matches)];
  return raws.map(lensMatchToCandidate).filter((c): c is Candidate => c !== null);
}

/**
 * TinEye REST search. `backlinks[].backlink` is the page URL and `backlinks[].url`
 * the direct image URL (matches[].image_url is TinEye's own copy).
 */
async function tineye(imageUrl: string): Promise<Candidate[]> {
  const key = requireEnv("TINEYE_API_KEY");
  const form = new FormData();
  form.append("image_url", imageUrl);
  form.append("limit", String(Math.max(env.MAX_CANDIDATES * 4, 50)));
  const { status, body } = await getJson("https://api.tineye.com/rest/search/", {
    method: "POST",
    headers: { "x-api-key": key },
    body: form,
  });
  if (status < 200 || status >= 300) {
    throw new UpstreamError("tineye", `search returned ${status}`);
  }
  const b = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const results = (typeof b.results === "object" && b.results !== null ? b.results : {}) as Record<string, unknown>;
  const out: Candidate[] = [];
  for (const rawMatch of asArray(results.matches)) {
    if (typeof rawMatch !== "object" || rawMatch === null) continue;
    const match = rawMatch as Record<string, unknown>;
    const image = str(match.image_url);
    for (const rawBacklink of asArray(match.backlinks)) {
      if (typeof rawBacklink !== "object" || rawBacklink === null) continue;
      const bl = rawBacklink as Record<string, unknown>;
      const page = str(bl.backlink) ?? str(bl.url);
      if (!page) continue;
      const platform = platformOf(page);
      if (platform === "other") continue;
      out.push({
        url: page,
        platform,
        thumbnail: str(bl.url) ?? image,
        title: str(match.domain),
        provider: "tineye",
      });
    }
  }
  return out;
}

/**
 * Google Lens first; fall back to TinEye when Lens fails (quota/non-2xx) or yields
 * no social candidates. With no TinEye key, an empty google_lens result is returned as-is.
 */
export async function searchCandidates(imageUrl: string): Promise<SearchResult> {
  const cap = env.MAX_CANDIDATES;
  const lens = await googleLens(imageUrl);
  if (lens && lens.length > 0) return { provider: "google_lens", candidates: dedupeAndCap(lens, cap) };

  if (!env.TINEYE_API_KEY) {
    if (lens === null) throw new UpstreamError("serpapi", "google_lens search failed and no TINEYE_API_KEY is set");
    return { provider: "google_lens", candidates: [] };
  }
  return { provider: "tineye", candidates: dedupeAndCap(await tineye(imageUrl), cap) };
}
