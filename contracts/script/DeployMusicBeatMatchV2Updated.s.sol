// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../contracts/MusicBeatMatchV2.sol";

contract DeployMusicBeatMatchV2Updated is Script {
    function run() external {
        // Configuration
        address toursToken = 0xa123600c82E69cB311B0e068B06Bfa9F787699B7;
        address keeper = 0xe67e13D545C76C2b4e28DFE27Ad827E1FC18e8D9; // Your deployer address

        console.log("=== Deploying MusicBeatMatchV2 (Rewards with TOURS) ===");
        console.log("TOURS Token:", toursToken);
        console.log("Keeper:", keeper);
        console.log("");

        vm.startBroadcast();

        MusicBeatMatchV2 beatMatch = new MusicBeatMatchV2(
            toursToken,
            keeper
        );

        vm.stopBroadcast();

        console.log("MusicBeatMatchV2 deployed to:", address(beatMatch));
        console.log("");
        console.log("To verify with Sourcify:");
        console.log("forge verify-contract", address(beatMatch), "contracts/MusicBeatMatchV2.sol:MusicBeatMatchV2 --chain 41454 --verifier sourcify");
    }
}
