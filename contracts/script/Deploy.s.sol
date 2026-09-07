// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {FaceMatchRegistry} from "../src/FaceMatchRegistry.sol";

contract DeployFaceMatchRegistry is Script {
    function run() external returns (FaceMatchRegistry) {
        uint256 key = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(key);
        FaceMatchRegistry registry = new FaceMatchRegistry();
        vm.stopBroadcast();
        console.log("FaceMatchRegistry deployed at:", address(registry));
        return registry;
    }
}
