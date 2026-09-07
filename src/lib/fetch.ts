import { CONFIG, isBlockedHost } from './config.js';

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), CONFIG.fetchTimeoutMs);
  try {
    return await fetch(url, { redirect: 'follow', signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

export async function fetchBytes(url: string, maxBytes = CONFIG.maxCandidateBytes): Promise<Uint8Array> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Blocked URL scheme: ${parsed.protocol}`);
  }
  if (isBlockedHost(parsed.hostname)) {
    throw new Error(`Blocked private/loopback host: ${parsed.hostname}`);
  }
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Fetch failed (${res.status}): ${url}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new Error(`Response too large (${buf.length} bytes): ${url}`);
  return buf;
}

// Extract og:image (or twitter:image) from an HTML page, best-effort.
export async function extractOgImage(pageUrl: string): Promise<string | undefined> {
  const res = await fetchWithTimeout(pageUrl);
  const text = await res.text();
  const match =
    text.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    text.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
    text.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
  if (match) return match[1];
  return undefined;
}
