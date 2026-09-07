"""Keccak256 hashing helpers. Must byte-for-byte match the Node implementation.

Uses pycryptodome's keccak (Ethereum keccak-256), NOT the NIST SHA3-256
variant that Python's hashlib.sha3_256 implements — the padding differs.
"""
from __future__ import annotations

import math

from Crypto.Hash import keccak


def keccak_hex(data: bytes) -> str:
    """Keccak256 of raw bytes, returned as 0x-prefixed lowercase hex."""
    h = keccak.new(digest_bits=256)
    h.update(data)
    return "0x" + h.hexdigest()


def face_hash(embedding: list[float]) -> str:
    """Keccak256 of a JSON-array-shaped string of int-quantized embedding values.

    Each value is scaled by 10000 and floored after adding 0.5 (i.e.
    math.floor(v * 10000 + 0.5)), matching Node's rounding rather than
    Python's banker's-rounding round().
    """
    ints = [math.floor(v * 10000 + 0.5) for v in embedding]
    serialized = "[" + ",".join(str(i) for i in ints) + "]"
    return keccak_hex(serialized.encode("utf-8"))
