import { keccak256, toBytes, type Hex } from "viem";

export function keccakBytes(bytes: Uint8Array): Hex {
  return keccak256(bytes);
}

// Quantize to 4 decimals then hash the JSON-array text. This exact serialization is
// mirrored in services/face/app/hashing.py — changing it breaks cross-language hashes.
export function faceHash(embedding: number[]): Hex {
  const serialized = `[${embedding.map((v) => Math.floor(v * 10000 + 0.5)).join(",")}]`;
  return keccak256(toBytes(serialized));
}
