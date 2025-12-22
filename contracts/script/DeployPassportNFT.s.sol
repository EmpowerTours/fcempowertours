// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import "../src/PassportNFT.sol";

/**
 * @notice Deploy PassportNFT - Country Collection NFTs with Credit Scoring
 *
 * === Monad Testnet Addresses ===
 * WMON: 0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541
 * Oracle (Bot Safe): 0x9c751Ba8D48f9Fa49Af0ef0A8227D0189aEd84f5
 * Platform Wallet: (from .env)
 *
 * === Features ===
 * - User-minted country passports (delegation support)
 * - Photo verification for 2x credit multiplier
 * - Venue stamps (10-15 pts) + Itinerary stamps (15-25 pts)
 * - Base credit: 100 + stamps
 * - Verified: 2x multiplier
 */
contract DeployPassportNFT is Script {
    // Monad Testnet addresses
    address constant WMON_TESTNET = 0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541;
    address constant ORACLE_TESTNET = 0x9c751Ba8D48f9Fa49Af0ef0A8227D0189aEd84f5;

    // Monad Mainnet addresses (placeholder)
    address constant WMON_MAINNET = address(0);
    address constant ORACLE_MAINNET = address(0);

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        // Auto-detect network based on chain ID (Monad Mainnet = 143, Testnet = 10143)
        bool isMainnet = block.chainid == 143;

        console.log("=== Deploying PassportNFT ===");
        console.log("Network:", isMainnet ? "MAINNET" : "TESTNET");
        console.log("Chain ID:", block.chainid);

        address wmonToken;
        address oracle;
        address platformWallet;

        if (isMainnet) {
            // Mainnet configuration
            wmonToken = WMON_MAINNET;
            oracle = ORACLE_MAINNET;
            platformWallet = vm.envAddress("PLATFORM_WALLET");

            require(wmonToken != address(0), "WMON not deployed to mainnet");
            require(oracle != address(0), "Oracle not set");
        } else {
            // Testnet configuration
            wmonToken = WMON_TESTNET;
            oracle = ORACLE_TESTNET;
            platformWallet = vm.envAddress("PLATFORM_WALLET");
        }

        console.log("");
        console.log("Configuration:");
        console.log("  WMON Token:", wmonToken);
        console.log("  Oracle (Bot Safe):", oracle);
        console.log("  Platform Wallet:", platformWallet);
        console.log("");

        // Deploy PassportNFT
        PassportNFT passport = new PassportNFT(
            wmonToken,
            oracle,
            platformWallet
        );

        console.log("=== Deployed! ===");
        console.log("PassportNFT:", address(passport));
        console.log("");

        console.log("=== Passport Configuration ===");
        console.log("Mint Price:", passport.MINT_PRICE() / 1e18, "WMON (~$0.70)");
        console.log("Verification Fee:", passport.VERIFICATION_FEE() / 1e18, "WMON (~$1.75)");
        console.log("Creator Share:", passport.CREATOR_PERCENTAGE(), "%");
        console.log("Platform Share:", passport.PLATFORM_PERCENTAGE(), "%");
        console.log("");

        console.log("=== Credit Scoring ===");
        console.log("Base Credit:", passport.BASE_CREDIT(), "points");
        console.log("Venue Stamp Range:", passport.MIN_VENUE_CREDIT(), "-", passport.MAX_VENUE_CREDIT(), "pts");
        console.log("Itinerary Stamp Range:", passport.MIN_ITINERARY_CREDIT(), "-", passport.MAX_ITINERARY_CREDIT(), "pts");
        console.log("Verification Multiplier: 2x (verified passports)");
        console.log("");

        console.log("=== Next Steps ===");
        console.log("1. User mints passport:");
        console.log("   wmon.approve(passportAddress, 20 ether)");
        console.log("   passport.mint(userFid, 'US', 'United States', 'North America', 'Americas', ipfsURI)");
        console.log("");
        console.log("2. User requests verification:");
        console.log("   passport.requestVerification(tokenId, photoProofIPFS)");
        console.log("");
        console.log("3. Oracle approves verification:");
        console.log("   passport.approveVerification(tokenId)");
        console.log("");
        console.log("4. Oracle adds stamps:");
        console.log("   passport.addVenueStamp(tokenId, venueName, 12)  // 12 pts");
        console.log("   passport.addItineraryStamp(tokenId, itineraryId, 20)  // 20 pts");
        console.log("");
        console.log("5. Check credit score:");
        console.log("   passport.getCreditScore(tokenId)");
        console.log("");

        console.log("=== Verify Contract ===");
        console.log("forge verify-contract", address(passport));
        console.log("  src/PassportNFT.sol:PassportNFT");
        console.log("  --chain-id", block.chainid);
        console.log("  --verifier sourcify");
        console.log("  --constructor-args:");
        console.log("    wmonToken:", wmonToken);
        console.log("    oracle:", oracle);
        console.log("    platformWallet:", platformWallet);
        console.log("");

        console.log("=== Update .env ===");
        console.log("NEXT_PUBLIC_PASSPORT_NFT_ADDRESS=%s", address(passport));

        vm.stopBroadcast();
    }
}
