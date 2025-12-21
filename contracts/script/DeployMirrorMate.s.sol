// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import "../contracts/MirrorMate.sol";

/**
 * @notice Deploy MirrorMate with multi-token support
 *
 * === Monad Testnet ===
 * Platform Safe: 0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20
 * shMON: 0x3a98250F98Dd388C211206983453837C8365BDc1
 *
 * === Monad Mainnet ===
 * WMON: 0x1B68626dCa36c7fE922fD2d55E4f631d962dE19c
 */
contract DeployMirrorMate is Script {
    // Monad Testnet addresses
    address constant PLATFORM_SAFE = 0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20;
    address constant SHMON_TESTNET = 0x3a98250F98Dd388C211206983453837C8365BDc1;

    // Monad Mainnet addresses
    address constant WMON_MAINNET = 0x1B68626dCa36c7fE922fD2d55E4f631d962dE19c;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        // Auto-detect network based on chain ID (Monad Mainnet = 143, Testnet = 10143)
        bool isMainnet = block.chainid == 143;

        console.log("=== Deploying MirrorMate ===");
        console.log("Network:", isMainnet ? "MAINNET" : "TESTNET");
        console.log("Chain ID:", block.chainid);

        address mon;
        address wmon;
        address shMonad;
        address platformWallet;

        if (isMainnet) {
            // Mainnet configuration
            // For MON on mainnet, we'll use a placeholder since MON is native
            // Users can use WMON or shMONAD for payments
            mon = WMON_MAINNET; // Use WMON as MON equivalent
            wmon = WMON_MAINNET;
            shMonad = vm.envAddress("SHMONAD_MAINNET"); // Set in .env when available
            platformWallet = vm.envAddress("PLATFORM_WALLET");

            console.log("MON (WMON):", mon);
            console.log("WMON:", wmon);
            console.log("shMONAD:", shMonad);
        } else {
            // Testnet configuration
            // For testnet, use placeholder addresses for MON and WMON
            // In practice, users will use shMON
            mon = address(1); // Placeholder for native MON
            wmon = address(2); // Placeholder for WMON (needs deployment)
            shMonad = SHMON_TESTNET;
            platformWallet = vm.envAddress("PLATFORM_WALLET");

            console.log("MON (placeholder):", mon);
            console.log("WMON (placeholder):", wmon);
            console.log("shMON:", shMonad);
        }

        console.log("Platform Wallet:", platformWallet);

        // Deploy MirrorMate
        MirrorMate mirrorMate = new MirrorMate(
            mon,
            wmon,
            shMonad,
            platformWallet
        );

        console.log("\n=== Deployed! ===");
        console.log("MirrorMate:", address(mirrorMate));

        console.log("\n=== Configuration ===");
        console.log("Free Skips: 10");
        console.log("Skip Cost After: 0.01 MON/WMON/shMON");
        console.log("Match Cost: 10 MON/WMON/shMON");
        console.log("Guide Earnings: 70% (7 tokens)");
        console.log("Platform Fee: 30% (3 tokens)");
        console.log("Accepted Tokens: MON, WMON, shMONAD");

        console.log("\n=== Verify Contract ===");
        console.log("forge verify-contract", address(mirrorMate));
        console.log("  --chain-id", block.chainid);
        console.log("  --constructor-args: Use cast abi-encode with addresses:");
        console.log("    mon:", mon);
        console.log("    wmon:", wmon);
        console.log("    shMonad:", shMonad);
        console.log("    platformWallet:", platformWallet);
        console.log("  --compiler-version v0.8.22");
        console.log("  contracts/MirrorMate.sol:MirrorMate");

        console.log("\n=== Add to .env ===");
        console.log("NEXT_PUBLIC_MIRRORMATE_ADDRESS=%s", address(mirrorMate));

        vm.stopBroadcast();
    }
}
