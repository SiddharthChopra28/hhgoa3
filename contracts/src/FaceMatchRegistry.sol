// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title FaceMatchRegistry
/// @notice Tamper-evident registry of face-match evidence produced by the
///         face-scan -> reverse-image-search -> verification pipeline.
/// @dev Records are keyed by the keccak256 hash of a canonical evidence
///      manifest. A key can never be overwritten, so each committed evidence
///      document is immutable and can be re-verified at any time.
contract FaceMatchRegistry {
    struct Record {
        bytes32 sourceImageHash; // keccak256 of the normalized input image
        bytes32 candidateImageHash; // keccak256 of the fetched candidate image
        string postUrl; // URL of the social-media post that matched
        uint16 faceScoreBps; // face similarity in basis points (0..10000)
        uint64 timestamp; // block timestamp at record time
        address submitter; // account that submitted the record
    }

    /// @notice evidenceHash => record. A zero timestamp means "not recorded".
    mapping(bytes32 => Record) public records;

    event MatchRecorded(
        bytes32 indexed evidenceHash,
        bytes32 indexed sourceImageHash,
        bytes32 candidateImageHash,
        string postUrl,
        uint16 faceScoreBps,
        uint64 timestamp,
        address indexed submitter
    );

    error AlreadyRecorded(bytes32 evidenceHash);
    error InvalidEvidence();

    /// @notice Commit a face-match evidence manifest to the registry.
    /// @param evidenceHash keccak256 of the canonical evidence manifest.
    /// @param sourceImageHash keccak256 of the normalized input image bytes.
    /// @param candidateImageHash keccak256 of the fetched candidate image bytes.
    /// @param postUrl URL of the matching social-media post.
    /// @param faceScoreBps face similarity score in basis points (0..10000).
    function record(
        bytes32 evidenceHash,
        bytes32 sourceImageHash,
        bytes32 candidateImageHash,
        string calldata postUrl,
        uint16 faceScoreBps
    ) external {
        if (evidenceHash == bytes32(0) || sourceImageHash == bytes32(0) || candidateImageHash == bytes32(0)) {
            revert InvalidEvidence();
        }
        if (records[evidenceHash].timestamp != 0) {
            revert AlreadyRecorded(evidenceHash);
        }
        uint64 ts = uint64(block.timestamp);
        records[evidenceHash] = Record({
            sourceImageHash: sourceImageHash,
            candidateImageHash: candidateImageHash,
            postUrl: postUrl,
            faceScoreBps: faceScoreBps,
            timestamp: ts,
            submitter: msg.sender
        });
        emit MatchRecorded(evidenceHash, sourceImageHash, candidateImageHash, postUrl, faceScoreBps, ts, msg.sender);
    }

    /// @notice Read a committed record back for verification.
    function getRecord(bytes32 evidenceHash) external view returns (Record memory) {
        return records[evidenceHash];
    }
}
