// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/MusicSubscriptionV2.sol";

contract DeployMusicSubscriptionV2 is Script {
    function run() external {
        // Configuration - UPDATE THESE AFTER DEPLOYING DEPENDENCIES
        address wmonToken = 0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541;
        address toursToken = 0x46d048EB424b0A95d5185f39C760c5FA754491d0;
        address nftContract = address(0); // UPDATE: EmpowerToursNFT address
        address treasury = 0xb5FF3Ed7Ab53A4DDA6C9887e0a0039C5f1E80107;
        address oracle = address(0);      // UPDATE: PlayOracle address

        console.log("=== Deploying MusicSubscriptionV2 ===");
        console.log("");
        console.log("Configuration:");
        console.log("  WMON Token:", wmonToken);
        console.log("  TOURS Token:", toursToken);
        console.log("  NFT Contract:", nftContract);
        console.log("  Treasury:", treasury);
        console.log("  Oracle:", oracle);
        console.log("");

        require(nftContract != address(0), "Set NFT contract address first");
        require(oracle != address(0), "Set Oracle address first");

        vm.startBroadcast();

        MusicSubscriptionV2 subscription = new MusicSubscriptionV2(
            wmonToken,
            toursToken,
            nftContract,
            treasury,
            oracle
        );

        vm.stopBroadcast();

        console.log("MusicSubscriptionV2 deployed to:", address(subscription));
        console.log("");
        console.log("Distribution Model:");
        console.log("  10% -> Treasury");
        console.log("  20% -> Reserve (in contract, for future DAO)");
        console.log("  70% -> Artist Pool");
        console.log("");
        console.log("TOURS Eligibility (default):");
        console.log("  Min Masters:", subscription.minMasterCount());
        console.log("  Min Lifetime Plays:", subscription.minLifetimePlays());
        console.log("  Monthly TOURS Reward:", subscription.monthlyToursReward() / 1e18, "TOURS");
        console.log("");
        console.log("Subscription Prices:");
        console.log("  Daily:", subscription.DAILY_PRICE() / 1e18, "WMON");
        console.log("  Weekly:", subscription.WEEKLY_PRICE() / 1e18, "WMON");
        console.log("  Monthly:", subscription.MONTHLY_PRICE() / 1e18, "WMON");
        console.log("  Yearly:", subscription.YEARLY_PRICE() / 1e18, "WMON");
        console.log("");
        console.log("Next steps:");
        console.log("  1. Call oracle.setMusicSubscription(subscriptionAddress)");
        console.log("  2. Fund contract with TOURS tokens for artist rewards");
        console.log("  3. Update frontend NEXT_PUBLIC_MUSIC_SUBSCRIPTION");
        console.log("");
        console.log("Update .env.local:");
        console.log('NEXT_PUBLIC_MUSIC_SUBSCRIPTION="', address(subscription), '"');
    }
}
