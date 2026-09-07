// One active pipeline run per client. In-memory: fine for a single-process deployment.
const active = new Map<string, number>();
const STALE_MS = 5 * 60 * 1000;

export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || headers.get("x-real-ip")?.trim() || "local";
}

export function acquire(ip: string): boolean {
  const started = active.get(ip);
  if (started !== undefined && Date.now() - started < STALE_MS) return false;
  active.set(ip, Date.now());
  return true;
}

export function release(ip: string): void {
  active.delete(ip);
}

// Per-client cooldown for endpoints that spend gas directly (e.g. /api/record).
const lastSpend = new Map<string, number>();

export function allowSpend(ip: string, cooldownMs: number): boolean {
  const last = lastSpend.get(ip);
  if (last !== undefined && Date.now() - last < cooldownMs) return false;
  lastSpend.set(ip, Date.now());
  return true;
}
