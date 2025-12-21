// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/MusicSubscriptionV2.sol";

contract DeployMusicSubscriptionV2 is Script {
    function run() external {
        // Configuration
        address wmonToken = 0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541;
        address toursToken = 0x46d048EB424b0A95d5185f39C760c5FA754491d0;
        address nftContract = 0x78Be595bf050bCB9F44A169447148FBfE6a3d7Ff; // NFTv9
        address treasury = 0x6d11A83fEeFa14eF1B38Dce97Be3995441c9fEc3;
        address oracle = 0x9c751Ba8D48f9Fa49Af0ef0A8227D0189aEd84f5; // Bot Safe account

        console.log("=== Deploying MusicSubscriptionV2 ===");
        console.log("WMON Token:", wmonToken);
        console.log("TOURS Token:", toursToken);
        console.log("NFT Contract (v9):", nftContract);
        console.log("Treasury:", treasury);
        console.log("Oracle (Safe):", oracle);
        console.log("");
        console.log("Features:");
        console.log("  - Multiple tiers: Daily/Weekly/Monthly/Yearly");
        console.log("  - NO TOURS staking required");
        console.log("  - Play-count based artist payouts");
        console.log("  - Anti-bot: play validation + community voting");
        console.log("  - Platform fee: 5%");
        console.log("");

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
        console.log("Pricing:");
        console.log("  Daily:   ", subscription.DAILY_PRICE() / 1e18, "WMON (~$0.52/day)");
        console.log("  Weekly:  ", subscription.WEEKLY_PRICE() / 1e18, "WMON (~$2.62/week)");
        console.log("  Monthly: ", subscription.MONTHLY_PRICE() / 1e18, "WMON (~$10.50/month)");
        console.log("  Yearly:  ", subscription.YEARLY_PRICE() / 1e18, "WMON (~$105/year)");
        console.log("");
        console.log("Limits:");
        console.log("  Min Play Duration:", subscription.MIN_PLAY_DURATION(), "seconds");
        console.log("  Replay Cooldown:", subscription.REPLAY_COOLDOWN() / 60, "minutes");
        console.log("  Max Plays/Day:", subscription.MAX_PLAYS_PER_USER_PER_DAY());
        console.log("  Votes to Flag:", subscription.VOTES_TO_FLAG());
        console.log("");
        console.log("To verify with Sourcify:");
        console.log("forge verify-contract", address(subscription), "src/MusicSubscriptionV2.sol:MusicSubscriptionV2 --chain-id 10143 --verifier sourcify");
        console.log("");
        console.log("Update .env.local:");
        console.log('NEXT_PUBLIC_MUSIC_SUBSCRIPTION="', address(subscription), '"');
    }
}
