import { keccakString } from './hash.js';

const SERPAPI = 'https://serpapi.com/search.json';

export interface Candidate {
  provider: 'google_lens' | 'yandex_reverse';
  pageUrl: string;
  imageUrl?: string;
  thumbnail?: string;
  title?: string;
  source?: string;
}

const SOCIAL_DOMAINS = [
  'instagram.com',
  'twitter.com',
  'x.com',
  'facebook.com',
  'reddit.com',
  'linkedin.com',
  'threads.net',
  'tiktok.com',
  'pinterest.com',
  'tumblr.com',
  'youtube.com',
  'flickr.com',
  'mastodon.',
  'bluesky',
  'bsky.app',
];

export function isSocialDomain(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return SOCIAL_DOMAINS.some((d) => host === d || host.endsWith('.' + d) || host.includes(d));
  } catch {
    return false;
  }
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.toString();
  } catch {
    return url;
  }
}

function apiKey(): string {
  const key = process.env.SERPAPI_API_KEY;
  if (!key) throw new Error('SERPAPI_API_KEY is not set');
  return key;
}

// Defensive: walk an object and collect every {link, thumbnail, image, title, source}
// shaped object we can find, so parser survives upstream response changes.
function collectCandidates(obj: unknown, provider: Candidate['provider'], out: Candidate[], depth = 0): void {
  if (!obj || typeof obj !== 'object' || depth > 5) return;
  if (Array.isArray(obj)) {
    for (const item of obj) collectCandidates(item, provider, out, depth + 1);
    return;
  }
  const o = obj as Record<string, unknown>;
  const link = typeof o.link === 'string' ? o.link : undefined;
  const imageUrl = typeof o.original === 'string' ? o.original : typeof o.image === 'string' ? o.image : undefined;
  if (link && link.startsWith('http')) {
    out.push({
      provider,
      pageUrl: normalizeUrl(link),
      imageUrl: typeof imageUrl === 'string' && imageUrl.startsWith('http') ? imageUrl : undefined,
      thumbnail: typeof o.thumbnail === 'string' ? o.thumbnail : undefined,
      title: typeof o.title === 'string' ? o.title : undefined,
      source: typeof o.source === 'string' ? o.source : undefined,
    });
  }
  for (const v of Object.values(o)) collectCandidates(v, provider, out, depth + 1);
}

async function serp(params: Record<string, string>): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams({ ...params, api_key: apiKey() });
  const res = await fetch(`${SERPAPI}?${qs.toString()}`);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`SerpApi request failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return JSON.parse(text);
}

export async function searchGoogleLens(imageUrl: string): Promise<Candidate[]> {
  const data = await serp({ engine: 'google_lens', url: imageUrl });
  const out: Candidate[] = [];
  // Prefer exact/visual match sections if present, then fall back to a full walk.
  for (const key of ['exact_matches', 'visual_matches', 'image_sources', 'reverse_image_search']) {
    if (Array.isArray((data as Record<string, unknown>)[key])) {
      collectCandidates((data as Record<string, unknown>)[key], 'google_lens', out);
    }
  }
  if (out.length === 0) collectCandidates(data, 'google_lens', out);
  return dedupe(out);
}

export async function searchYandex(imageUrl: string): Promise<Candidate[]> {
  const data = await serp({ engine: 'yandex_images', url: imageUrl, tab: 'about' });
  const out: Candidate[] = [];
  for (const key of ['images_results', 'similar_images_results', 'visual_matches']) {
    if (Array.isArray((data as Record<string, unknown>)[key])) {
      collectCandidates((data as Record<string, unknown>)[key], 'yandex_reverse', out);
    }
  }
  if (out.length === 0) collectCandidates(data, 'yandex_reverse', out);
  return dedupe(out);
}

function dedupe(candidates: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const c of candidates) {
    const key = keccakString(c.pageUrl);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

// Social posts ranked first, then everything else, preserving provider order.
export function rankCandidates(candidates: Candidate[]): Candidate[] {
  const social = candidates.filter((c) => isSocialDomain(c.pageUrl));
  const rest = candidates.filter((c) => !isSocialDomain(c.pageUrl));
  return [...social, ...rest];
}

export async function searchAll(imageUrl: string): Promise<{ candidates: Candidate[]; perProvider: Record<string, number> }> {
  // Smoke-test fixture: bypass live search with a single fixed candidate URL.
  // Used to exercise the full pipeline end-to-end without consuming API quota.
  const mock = process.env.MOCK_SEARCH_URL;
  if (mock) {
    return {
      candidates: rankCandidates([{ provider: 'google_lens', pageUrl: mock, imageUrl: mock }]),
      perProvider: { google_lens: 1, yandex_reverse: 0, mocked: 1 },
    };
  }

  const perProvider: Record<string, number> = {};
  const results = await Promise.allSettled([searchGoogleLens(imageUrl), searchYandex(imageUrl)]);
  const merged: Candidate[] = [];
  const providers = ['google_lens', 'yandex_reverse'];
  results.forEach((r, i) => {
    const name = providers[i];
    if (r.status === 'fulfilled') {
      perProvider[name] = r.value.length;
      merged.push(...r.value);
    } else {
      perProvider[name] = 0;
      perProvider[`${name}_error`] = 1;
    }
  });
  return { candidates: rankCandidates(merged), perProvider };
}
