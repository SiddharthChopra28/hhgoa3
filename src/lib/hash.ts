import { keccak256, toHex, stringToHex } from 'viem';

export function keccakBytes(bytes: Uint8Array): string {
  return keccak256(toHex(bytes));
}

export function keccakString(s: string): string {
  return keccak256(stringToHex(s));
}

// Stable stringify: sort object keys recursively so the same logical manifest
// always serializes to the same bytes regardless of insertion order.
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map((v) => canonicalJson(v)).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}';
}

// cosine similarity in [-1,1] -> basis points in [0,10000], clamped.
export function cosineToBps(cos: number): number {
  const clamped = Math.max(-1, Math.min(1, cos));
  const scaled = ((clamped + 1) / 2) * 10000;
  return Math.round(scaled);
}

export function bpsToPercent(bps: number): number {
  return Math.round((bps / 10000) * 1000) / 10;
}
