// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {FaceMatchRegistry} from "../src/FaceMatchRegistry.sol";

contract FaceMatchRegistryTest is Test {
    FaceMatchRegistry public registry;

    bytes32 constant IMAGE_HASH = keccak256("image");
    bytes32 constant FACE_HASH = keccak256("face");
    string constant POST_URL = "https://example.com/post/1";

    address constant SUBMITTER = address(0xBEEF);
    uint64 constant TIMESTAMP = 1_700_000_000;

    function setUp() public {
        registry = new FaceMatchRegistry();
    }

    function testRecordAndGetRecord() public {
        vm.warp(TIMESTAMP);
        vm.prank(SUBMITTER);
        registry.record(IMAGE_HASH, FACE_HASH, POST_URL);

        FaceMatchRegistry.Record memory r = registry.getRecord(IMAGE_HASH);
        assertEq(r.imageHash, IMAGE_HASH);
        assertEq(r.faceHash, FACE_HASH);
        assertEq(r.postUrl, POST_URL);
        assertEq(r.timestamp, TIMESTAMP);
        assertEq(r.submitter, SUBMITTER);
    }

    function testEmitsMatchRecorded() public {
        vm.warp(TIMESTAMP);
        vm.expectEmit(true, false, false, true);
        emit FaceMatchRegistry.MatchRecorded(IMAGE_HASH, FACE_HASH, POST_URL, TIMESTAMP);
        registry.record(IMAGE_HASH, FACE_HASH, POST_URL);
    }

    function testOverwriteReturnsSecondRecord() public {
        vm.warp(TIMESTAMP);
        vm.prank(SUBMITTER);
        registry.record(IMAGE_HASH, FACE_HASH, POST_URL);

        bytes32 newFaceHash = keccak256("face2");
        string memory newUrl = "https://example.com/post/2";
        address other = address(0xCAFE);
        uint64 newTimestamp = TIMESTAMP + 100;

        vm.warp(newTimestamp);
        vm.prank(other);
        registry.record(IMAGE_HASH, newFaceHash, newUrl);

        FaceMatchRegistry.Record memory r = registry.getRecord(IMAGE_HASH);
        assertEq(r.imageHash, IMAGE_HASH);
        assertEq(r.faceHash, newFaceHash);
        assertEq(r.postUrl, newUrl);
        assertEq(r.timestamp, newTimestamp);
        assertEq(r.submitter, other);
    }

    function testRevertsOnZeroImageHash() public {
        vm.expectRevert(FaceMatchRegistry.ZeroHash.selector);
        registry.record(bytes32(0), FACE_HASH, POST_URL);
    }

    function testRevertsOnZeroFaceHash() public {
        vm.expectRevert(FaceMatchRegistry.ZeroHash.selector);
        registry.record(IMAGE_HASH, bytes32(0), POST_URL);
    }

    function testRevertsOnEmptyUrl() public {
        vm.expectRevert(FaceMatchRegistry.EmptyUrl.selector);
        registry.record(IMAGE_HASH, FACE_HASH, "");
    }

    function testGetRecordUnknownHashReturnsZeroedStruct() public view {
        FaceMatchRegistry.Record memory r = registry.getRecord(keccak256("unknown"));
        assertEq(r.imageHash, bytes32(0));
        assertEq(r.faceHash, bytes32(0));
        assertEq(r.postUrl, "");
        assertEq(r.timestamp, 0);
        assertEq(r.submitter, address(0));
    }
}
