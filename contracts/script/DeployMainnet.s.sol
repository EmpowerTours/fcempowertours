// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

/**
 * @title DeployMainnet
 * @notice Mainnet deployment configuration and checklist for EmpowerTours
 * @dev Monad Mainnet (Chain ID: 143)
 *
 * =====================================================
 * MONAD MAINNET PROTOCOL ADDRESSES
 * =====================================================
 * Chain ID: 143
 * RPC: https://rpc.monad.xyz
 * Explorer: https://monadscan.com
 *
 * Native Token: MON (18 decimals)
 * WMON: 0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A
 * EntryPoint (v0.7): 0x0000000071727De22E5E9d8BAf0edAc6f37da032
 * Pyth Entropy: 0xd458261E832415CFD3BAE5E416FdF3230CE6F134
 *
 * =====================================================
 * DEPLOYMENT ORDER
 * =====================================================
 *
 * Phase 1: Core Infrastructure
 * 1. Safe Multi-Sig (Platform Safe) - via Safe UI
 * 2. TOURS Token (ERC20)
 * 3. EmpowerToursTreasury (platform fees)
 *
 * Phase 2: NFT Contracts
 * 4. PassportNFT
 * 5. EmpowerToursNFT (music NFTs)
 *
 * Phase 3: DeFi & Staking
 * 6. YieldStrategy (NFT staking)
 * 7. DAOReserve (DAO-governed reserve)
 *
 * Phase 4: Core Features
 * 8. DailyPassLotteryWMON (lottery with Pyth randomness)
 * 9. LiveRadio (jukebox with Pyth randomness)
 * 10. MusicSubscriptionV2 (streaming subscriptions)
 *
 * Phase 5: Marketplace & Services
 * 11. TourGuideRegistry (MirrorMate)
 * 12. EventSponsorshipV2 (sponsor voting)
 *
 * =====================================================
 * USAGE
 * =====================================================
 *
 * Each contract has its own deploy script. Run them in order:
 *
 * # Phase 1: Core
 * forge script script/DeployTreasury.s.sol:DeployTreasury \
 *   --rpc-url https://rpc.monad.xyz --broadcast --verify
 *
 * # Phase 2-5: Other contracts
 * See individual deploy scripts in script/ directory
 *
 * # Verify all contracts:
 * forge verify-contract <address> <contract> \
 *   --chain-id 143 --verifier-url https://api.monadscan.com/api
 */
contract DeployMainnet is Script {

    // =====================================================
    // MAINNET PROTOCOL ADDRESSES
    // =====================================================

    // Native wrapped token
    address constant WMON = 0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A;

    // ERC-4337 Account Abstraction
    address constant ENTRYPOINT = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;

    // Pyth Network (Entropy for randomness)
    address constant PYTH_ENTROPY = 0xd458261E832415CFD3BAE5E416FdF3230CE6F134;

    // =====================================================
    // DEPLOYED CONTRACT ADDRESSES (UPDATE AFTER DEPLOY)
    // =====================================================

    // Core (Phase 1)
    address public PLATFORM_SAFE = address(0);     // Safe multi-sig
    address public TOURS_TOKEN = address(0);       // TOURS ERC20
    address public TREASURY = address(0);          // Platform fees

    // NFTs (Phase 2)
    address public PASSPORT_NFT = address(0);
    address public MUSIC_NFT = address(0);

    // DeFi (Phase 3)
    address public YIELD_STRATEGY = address(0);
    address public DAO_RESERVE = address(0);

    // Features (Phase 4)
    address public LOTTERY = address(0);
    address public LIVE_RADIO = address(0);
    address public MUSIC_SUBSCRIPTION = address(0);

    // Marketplace (Phase 5)
    address public TOUR_GUIDE_REGISTRY = address(0);
    address public EVENT_SPONSORSHIP = address(0);

    function run() external view {
        console.log("==============================================");
        console.log("EMPOWERTOURS MAINNET DEPLOYMENT CONFIG");
        console.log("==============================================");
        console.log("");
        console.log("Network: Monad Mainnet (Chain ID: 143)");
        console.log("RPC: https://rpc.monad.xyz");
        console.log("Explorer: https://monadscan.com");
        console.log("");
        console.log("==============================================");
        console.log("PROTOCOL ADDRESSES");
        console.log("==============================================");
        console.log("WMON:", WMON);
        console.log("EntryPoint (v0.7):", ENTRYPOINT);
        console.log("Pyth Entropy:", PYTH_ENTROPY);
        console.log("");
        console.log("==============================================");
        console.log("DEPLOYMENT ORDER");
        console.log("==============================================");
        console.log("");
        console.log("Phase 1: Core Infrastructure");
        console.log("  1. Safe Multi-Sig (via Safe UI)");
        console.log("  2. TOURS Token");
        console.log("  3. EmpowerToursTreasury");
        console.log("");
        console.log("Phase 2: NFT Contracts");
        console.log("  4. PassportNFT");
        console.log("  5. EmpowerToursNFT");
        console.log("");
        console.log("Phase 3: DeFi & Staking");
        console.log("  6. YieldStrategy");
        console.log("  7. DAOReserve");
        console.log("");
        console.log("Phase 4: Core Features");
        console.log("  8. DailyPassLotteryWMON");
        console.log("  9. LiveRadio");
        console.log("  10. MusicSubscriptionV2");
        console.log("");
        console.log("Phase 5: Marketplace & Services");
        console.log("  11. TourGuideRegistry");
        console.log("  12. EventSponsorshipV2");
        console.log("");
        console.log("==============================================");
        console.log("INDIVIDUAL DEPLOY COMMANDS");
        console.log("==============================================");
        console.log("");
        console.log("# Treasury:");
        console.log("forge script script/DeployTreasury.s.sol:DeployTreasury \\");
        console.log("  --rpc-url https://rpc.monad.xyz --broadcast --verify");
        console.log("");
        console.log("# Lottery:");
        console.log("forge script script/DeployDailyPassLotteryWMON.s.sol \\");
        console.log("  --rpc-url https://rpc.monad.xyz --broadcast --verify");
        console.log("");
        console.log("# LiveRadio:");
        console.log("forge script script/DeployLiveRadio.s.sol \\");
        console.log("  --rpc-url https://rpc.monad.xyz --broadcast --verify");
        console.log("");
        console.log("==============================================");
    }
}
