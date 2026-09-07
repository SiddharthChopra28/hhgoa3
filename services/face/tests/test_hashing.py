from app.hashing import face_hash, keccak_hex


def test_keccak_hex_empty_bytes():
    assert (
        keccak_hex(b"")
        == "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"
    )


def test_face_hash_matches_quantized_serialization():
    expected = keccak_hex(b"[1235,-5000,10000]")
    assert face_hash([0.12345, -0.5, 1.0]) == expected
