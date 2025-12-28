// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/PlayOracle.sol";

contract DeployPlayOracle is Script {
    function run() external {
        // MusicSubscriptionV2 address - UPDATE AFTER DEPLOYING MusicSubscriptionV2
        address musicSubscription = address(0); // Placeholder - will update post-deployment

        console.log("=== Deploying PlayOracle ===");
        console.log("");
        console.log("NOTE: MusicSubscription address is placeholder (0x0)");
        console.log("After deploying MusicSubscriptionV2, call:");
        console.log("  oracle.setMusicSubscription(musicSubscriptionAddress)");
        console.log("");

        vm.startBroadcast();

        PlayOracle oracle = new PlayOracle(musicSubscription);

        vm.stopBroadcast();

        console.log("PlayOracle deployed to:", address(oracle));
        console.log("");
        console.log("Features:");
        console.log("  - Operator-based access control");
        console.log("  - Anti-replay protection (30s default)");
        console.log("  - Batch play recording support");
        console.log("");
        console.log("Next steps:");
        console.log("  1. Deploy MusicSubscriptionV2 with this oracle address");
        console.log("  2. Call oracle.setMusicSubscription(musicSubAddress)");
        console.log("  3. Add backend wallet as operator: oracle.addOperator(backendWallet)");
        console.log("");
        console.log("Update .env.local:");
        console.log('NEXT_PUBLIC_PLAY_ORACLE="', address(oracle), '"');
    }
}
