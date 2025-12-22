// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import "../src/ItineraryNFT.sol";

/**
 * @notice Deploy ItineraryNFT - User-Generated Travel Itineraries
 *
 * === Monad Testnet Addresses ===
 * WMON: 0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541
 * Oracle (Bot Safe): 0x9c751Ba8D48f9Fa49Af0ef0A8227D0189aEd84f5
 * Platform Wallet: (from .env)
 *
 * === Features ===
 * - User-generated content (UGC): First visitor creates itinerary
 * - Creator attribution: 70% of all sales
 * - Google Maps integration: placeId + coordinates for every location
 * - Photo proof required for creation/completion
 * - Delegation support for purchases
 */
contract DeployItineraryNFT is Script {
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

        console.log("=== Deploying ItineraryNFT ===");
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

        // Deploy ItineraryNFT
        ItineraryNFT itinerary = new ItineraryNFT(
            wmonToken,
            oracle,
            platformWallet
        );

        console.log("=== Deployed! ===");
        console.log("ItineraryNFT:", address(itinerary));
        console.log("");

        console.log("=== Revenue Split ===");
        console.log("Creator Share:", itinerary.CREATOR_PERCENTAGE(), "%");
        console.log("Platform Share:", itinerary.PLATFORM_PERCENTAGE(), "%");
        console.log("");

        console.log("=== Creation Flow ===");
        console.log("1. User visits location (GPS-detected)");
        console.log("2. User takes photo + adds review");
        console.log("3. Oracle calls createItinerary() with Gemini Maps data:");
        console.log("");
        console.log("   Location[] memory locations = new Location[](3);");
        console.log("   locations[0] = Location({");
        console.log("     name: 'Eiffel Tower',");
        console.log("     placeId: 'ChIJLU7jZClu5kcR4PcOOO6p3I0',");
        console.log("     googleMapsUri: 'https://maps.google.com/?cid=...',");
        console.log("     latitude: 48857700,  // 48.8577 * 1e6");
        console.log("     longitude: 2294500,  // 2.2945 * 1e6");
        console.log("     description: 'Iconic landmark'");
        console.log("   });");
        console.log("");
        console.log("   itinerary.createItinerary(");
        console.log("     creatorAddress,");
        console.log("     creatorFid,");
        console.log("     'Paris Highlights',");
        console.log("     'Amazing day tour of Paris',");
        console.log("     'Paris',");
        console.log("     'France',");
        console.log("     100 ether,  // 100 WMON price");
        console.log("     photoProofIPFS,");
        console.log("     locations");
        console.log("   );");
        console.log("");

        console.log("=== Purchase Flow ===");
        console.log("1. User discovers itinerary:");
        console.log("   itinerary.getItinerary(itineraryId)");
        console.log("   itinerary.getLocations(itineraryId)");
        console.log("");
        console.log("2. User purchases (70% to creator, 30% to platform):");
        console.log("   wmon.approve(itineraryAddress, price)");
        console.log("   itinerary.purchase(itineraryId, userFid)");
        console.log("");
        console.log("3. User completes locations:");
        console.log("   itinerary.completeLocation(itineraryId, userAddress, locationIndex, photoIPFS)");
        console.log("");
        console.log("4. User rates after completion:");
        console.log("   itinerary.rateItinerary(itineraryId, 450)  // 4.5 stars");
        console.log("");

        console.log("=== View Functions ===");
        console.log("- getCreatorItineraries(address) - All itineraries by creator");
        console.log("- getFidItineraries(fid) - All itineraries by FID");
        console.log("- getUserProgress(itineraryId, user) - Completion progress");
        console.log("- getLocationCompletion(itineraryId, user, index) - Location details");
        console.log("");

        console.log("=== Verify Contract ===");
        console.log("forge verify-contract", address(itinerary));
        console.log("  src/ItineraryNFT.sol:ItineraryNFT");
        console.log("  --chain-id", block.chainid);
        console.log("  --verifier sourcify");
        console.log("  --constructor-args:");
        console.log("    wmonToken:", wmonToken);
        console.log("    oracle:", oracle);
        console.log("    platformWallet:", platformWallet);
        console.log("");

        console.log("=== Update .env ===");
        console.log("NEXT_PUBLIC_ITINERARY_NFT_ADDRESS=%s", address(itinerary));

        vm.stopBroadcast();
    }
}
