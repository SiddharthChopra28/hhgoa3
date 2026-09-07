import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 0xabcdef… -> 0xabcd…cdef */
export function truncateHash(value: string, head = 10, tail = 8) {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function chainName(chainId: number) {
  if (chainId === 42161) return "Arbitrum One";
  if (chainId === 421614) return "Arbitrum Sepolia";
  if (chainId === 11155111) return "Ethereum Sepolia";
  return `Chain ${chainId}`;
}

/** wei (decimal string) -> "0.000123 ETH" */
export function formatEth(wei: string) {
  let value: bigint;
  try {
    value = BigInt(wei);
  } catch {
    return null;
  }
  const base = 1000000000000000000n;
  const whole = value / base;
  const frac = (value % base).toString().padStart(18, "0").slice(0, 6);
  return `${whole.toString()}.${frac}`;
}

export function formatDuration(ms: number) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
