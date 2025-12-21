// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/MusicSubscription.sol";

contract DeployMusicSubscription is Script {
    function run() external {
        // Configuration
        address wmonToken = 0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541;
        address toursToken = 0xa123600c82E69cB311B0e068B06Bfa9F787699B7;
        address nftContract = vm.envAddress("NEXT_PUBLIC_NFT_ADDRESS"); // NFTv9 must be deployed first
        address treasury = 0x6d11A83fEeFa14eF1B38Dce97Be3995441c9fEc3;
        address oracle = 0x9c751Ba8D48f9Fa49Af0ef0A8227D0189aEd84f5; // Bot Safe account

        console.log("=== Deploying MusicSubscription ===");
        console.log("WMON Token:", wmonToken);
        console.log("TOURS Token:", toursToken);
        console.log("NFT Contract (v9):", nftContract);
        console.log("Treasury:", treasury);
        console.log("Oracle (Safe):", oracle);
        console.log("");
        console.log("Features:");
        console.log("  - 300 WMON/month platform-wide access");
        console.log("  - Play-count based artist payouts");
        console.log("  - 1000 TOURS staking (slashed if botting)");
        console.log("  - Anti-bot: play validation, captcha, behavior analysis");
        console.log("  - Community governance (100 votes = slash)");
        console.log("");

        vm.startBroadcast();

        MusicSubscription subscription = new MusicSubscription(
            wmonToken,
            toursToken,
            nftContract,
            treasury,
            oracle
        );

        vm.stopBroadcast();

        console.log("MusicSubscription deployed to:", address(subscription));
        console.log("");
        console.log("Configuration:");
        console.log("  Monthly Price:", subscription.MONTHLY_SUBSCRIPTION_PRICE() / 1e18, "WMON (~$10.50)");
        console.log("  Stake Required:", subscription.SUBSCRIPTION_STAKE_REQUIRED() / 1e18, "TOURS");
        console.log("  Platform Fee:", subscription.PLATFORM_FEE_PERCENTAGE(), "%");
        console.log("  Min Play Duration:", subscription.MIN_PLAY_DURATION(), "seconds");
        console.log("  Replay Cooldown:", subscription.REPLAY_COOLDOWN(), "seconds (5 min)");
        console.log("  Max Plays/Day:", subscription.MAX_PLAYS_PER_USER_PER_DAY());
        console.log("  Votes to Slash:", subscription.VOTES_TO_SLASH());
        console.log("");
        console.log("To verify with Sourcify:");
        console.log("forge verify-contract", address(subscription), "src/MusicSubscription.sol:MusicSubscription --chain 41454 --verifier sourcify");
        console.log("");
        console.log("Update .env.local:");
        console.log('NEXT_PUBLIC_MUSIC_SUBSCRIPTION="', address(subscription), '"');
    }
}
