// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title FaceMatchRegistry
/// @notice On-chain registry of face-match records, keyed by image hash.
contract FaceMatchRegistry {
    /// @notice A single face-match record.
    struct Record {
        bytes32 imageHash;
        bytes32 faceHash;
        string postUrl;
        uint64 timestamp;
        address submitter;
    }

    /// @notice imageHash => Record. Re-recording an imageHash overwrites its entry.
    mapping(bytes32 => Record) public records;

    /// @notice Emitted whenever a record is written (including overwrites).
    event MatchRecorded(bytes32 indexed imageHash, bytes32 faceHash, string postUrl, uint64 timestamp);

    /// @notice Thrown when imageHash or faceHash is the zero hash.
    error ZeroHash();
    /// @notice Thrown when postUrl is empty.
    error EmptyUrl();

    /// @notice Record (or overwrite) a face match for an image hash.
    /// @param imageHash Hash of the source image; used as the storage key.
    /// @param faceHash Hash of the matched face.
    /// @param postUrl URL of the post where the match was found.
    function record(bytes32 imageHash, bytes32 faceHash, string calldata postUrl) external {
        if (imageHash == bytes32(0) || faceHash == bytes32(0)) revert ZeroHash();
        if (bytes(postUrl).length == 0) revert EmptyUrl();

        uint64 timestamp = uint64(block.timestamp);
        records[imageHash] =
            Record({imageHash: imageHash, faceHash: faceHash, postUrl: postUrl, timestamp: timestamp, submitter: msg.sender});

        emit MatchRecorded(imageHash, faceHash, postUrl, timestamp);
    }

    /// @notice Fetch the record stored for an image hash.
    /// @param imageHash The image hash to look up.
    /// @return The stored record, or a zeroed struct if none exists.
    function getRecord(bytes32 imageHash) external view returns (Record memory) {
        return records[imageHash];
    }
}
