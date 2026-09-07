// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {FaceMatchRegistry} from "../src/FaceMatchRegistry.sol";

contract FaceMatchRegistryTest is Test {
    FaceMatchRegistry public registry;

    bytes32 constant EVIDENCE = keccak256("evidence");
    bytes32 constant SRC = keccak256("source");
    bytes32 constant CAND = keccak256("candidate");

    function setUp() public {
        registry = new FaceMatchRegistry();
    }

    function testRecordAndReadBack() public {
        string memory url = "https://example.com/post/1";
        registry.record(EVIDENCE, SRC, CAND, url, 8734);

        FaceMatchRegistry.Record memory r = registry.getRecord(EVIDENCE);
        assertEq(r.sourceImageHash, SRC);
        assertEq(r.candidateImageHash, CAND);
        assertEq(r.postUrl, url);
        assertEq(r.faceScoreBps, 8734);
        assertEq(r.submitter, address(this));
        assertTrue(r.timestamp != 0);
    }

    function testEmitsMatchRecorded() public {
        vm.expectEmit(true, true, true, false);
        emit FaceMatchRegistry.MatchRecorded(EVIDENCE, SRC, CAND, "https://example.com/post/1", 8734, 0, address(this));
        registry.record(EVIDENCE, SRC, CAND, "https://example.com/post/1", 8734);
    }

    function testCannotOverwrite() public {
        registry.record(EVIDENCE, SRC, CAND, "https://example.com/post/1", 8734);
        vm.expectRevert(abi.encodeWithSelector(FaceMatchRegistry.AlreadyRecorded.selector, EVIDENCE));
        registry.record(EVIDENCE, SRC, CAND, "https://example.com/post/2", 9000);
    }

    function testRejectsZeroHashes() public {
        vm.expectRevert(FaceMatchRegistry.InvalidEvidence.selector);
        registry.record(bytes32(0), SRC, CAND, "https://example.com/post/1", 8734);

        vm.expectRevert(FaceMatchRegistry.InvalidEvidence.selector);
        registry.record(EVIDENCE, bytes32(0), CAND, "https://example.com/post/1", 8734);
    }
}
