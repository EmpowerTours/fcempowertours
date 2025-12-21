// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/EmpowerToursNFTv9.sol";
import "../src/MusicSubscription.sol";

contract DeployNFTv9AndSubscription is Script {
    function run() external {
        // Configuration
        address treasury = 0x6d11A83fEeFa14eF1B38Dce97Be3995441c9fEc3;
        address wmonToken = 0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701;
        address toursToken = 0xa123600c82E69cB311B0e068B06Bfa9F787699B7;
        address safeAccount = 0x9c751Ba8D48f9Fa49Af0ef0A8227D0189aEd84f5; // Bot Safe

        console.log("=============================================================");
        console.log("   DEPLOYING NFTv9 + MUSIC SUBSCRIPTION SYSTEM");
        console.log("=============================================================");
        console.log("");
        console.log("Configuration:");
        console.log("  Treasury:", treasury);
        console.log("  WMON Token:", wmonToken);
        console.log("  TOURS Token:", toursToken);
        console.log("  Safe (Oracle/Burner):", safeAccount);
        console.log("");

        vm.startBroadcast();

        // ============================================
        // 1. Deploy NFTv9
        // ============================================
        console.log("Step 1: Deploying EmpowerToursNFTv9...");
        EmpowerToursNFTv9 nft = new EmpowerToursNFTv9(
            treasury,
            wmonToken,
            toursToken
        );
        console.log("  NFTv9 deployed to:", address(nft));
        console.log("");

        // ============================================
        // 2. Deploy MusicSubscription
        // ============================================
        console.log("Step 2: Deploying MusicSubscription...");
        MusicSubscription subscription = new MusicSubscription(
            wmonToken,
            toursToken,
            address(nft), // Reference NFTv9
            treasury,
            safeAccount  // Oracle for play recording
        );
        console.log("  MusicSubscription deployed to:", address(subscription));
        console.log("");

        // ============================================
        // 3. Post-deployment setup
        // ============================================
        console.log("Step 3: Configuring contracts...");

        // Authorize Safe as burner for delegated burning
        nft.setAuthorizedBurner(safeAccount, true);
        console.log("  Safe authorized as burner on NFTv9");

        vm.stopBroadcast();

        console.log("");
        console.log("=============================================================");
        console.log("   DEPLOYMENT COMPLETE!");
        console.log("=============================================================");
        console.log("");
        console.log("CONTRACT ADDRESSES:");
        console.log("  EmpowerToursNFTv9:", address(nft));
        console.log("  MusicSubscription:", address(subscription));
        console.log("");
        console.log("NFTv9 CONFIGURATION:");
        console.log("  Min License Price:", nft.MINIMUM_LICENSE_PRICE() / 1e18, "WMON (~$1.23)");
        console.log("  Min Collector Price:", nft.MINIMUM_COLLECTOR_PRICE() / 1e18, "WMON (~$17.50)");
        console.log("  Music Royalty:", nft.MUSIC_ROYALTY(), "bps (5%)");
        console.log("  Art Royalty:", nft.ART_ROYALTY(), "bps (7.5%)");
        console.log("  Treasury Fee:", nft.treasuryFee(), "%");
        console.log("  Master Burn Reward:", nft.masterBurnReward() / 1e18, "TOURS");
        console.log("  Active License Burn:", nft.activeLicenseBurnReward() / 1e18, "TOURS");
        console.log("  Expired License Burn:", nft.expiredLicenseBurnReward() / 1e18, "TOURS");
        console.log("");
        console.log("SUBSCRIPTION CONFIGURATION:");
        console.log("  Monthly Price:", subscription.MONTHLY_SUBSCRIPTION_PRICE() / 1e18, "WMON (~$10.50)");
        console.log("  Stake Required:", subscription.SUBSCRIPTION_STAKE_REQUIRED() / 1e18, "TOURS");
        console.log("  Platform Fee:", subscription.PLATFORM_FEE_PERCENTAGE(), "%");
        console.log("  Min Play Duration:", subscription.MIN_PLAY_DURATION(), "seconds");
        console.log("  Replay Cooldown:", subscription.REPLAY_COOLDOWN() / 60, "minutes");
        console.log("  Max Plays/Day:", subscription.MAX_PLAYS_PER_USER_PER_DAY());
        console.log("  Max Plays/Song/Day:", subscription.MAX_PLAYS_PER_SONG_PER_USER_PER_DAY());
        console.log("  Votes to Slash:", subscription.VOTES_TO_SLASH());
        console.log("");
        console.log("=============================================================");
        console.log("");
        console.log("UPDATE .env.local:");
        console.log('NEXT_PUBLIC_NFT_ADDRESS="', address(nft), '"');
        console.log('NEXT_PUBLIC_MUSIC_SUBSCRIPTION="', address(subscription), '"');
        console.log("");
        console.log("VERIFY CONTRACTS:");
        console.log("");
        console.log("# NFTv9");
        console.log("forge verify-contract \\");
        console.log("  ", address(nft), "\\");
        console.log("  src/EmpowerToursNFTv9.sol:EmpowerToursNFTv9 \\");
        console.log("  --chain 41454 \\");
        console.log("  --verifier sourcify");
        console.log("");
        console.log("# MusicSubscription");
        console.log("forge verify-contract \\");
        console.log("  ", address(subscription), "\\");
        console.log("  src/MusicSubscription.sol:MusicSubscription \\");
        console.log("  --chain 41454 \\");
        console.log("  --verifier sourcify");
        console.log("");
        console.log("=============================================================");
    }
}
