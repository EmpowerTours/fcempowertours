// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/WMONFaucet.sol";

contract DeployWMONFaucet is Script {
    function run() external {
        address wmon = 0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541;

        console.log("=== Deploying WMON Faucet ===");
        console.log("WMON:", wmon);

        vm.startBroadcast();

        WMONFaucet faucet = new WMONFaucet(wmon);

        console.log("Faucet deployed to:", address(faucet));

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployment Complete ===");
        console.log("Faucet:", address(faucet));
        console.log("");
        console.log("Next steps:");
        console.log("1. Fund the faucet: send MON to", address(faucet));
        console.log("2. Or call fundWithMON() with MON");
        console.log("3. Users can claim 20 WMON every 24 hours");
    }
}
