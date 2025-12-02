// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../contracts/ActionBasedDemandSignal.sol";
import "../contracts/ItineraryNFT.sol";
import "../contracts/MusicBeatMatch.sol";
import "../contracts/CountryCollector.sol";
import "../contracts/TandaPool.sol";

/**
 * @title DeployMainnet
 * @notice Mainnet deployment script for EmpowerTours contracts
 * @dev Deploys to Monad Mainnet (Chain ID: 143)
 *
 * Monad Mainnet Configuration:
 * - Chain ID: 143
 * - RPC: https://rpc.monad.xyz
 * - Explorer: https://monadscan.com
 * - WMON: 0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A
 * - EntryPoint: 0x0000000071727De22E5E9d8BAf0edAc6f37da032
 *
 * Usage:
 * forge script script/DeployMainnet.s.sol:DeployMainnet \
 *   --rpc-url https://rpc.monad.xyz \
 *   --broadcast \
 *   --verify \
 *   --verifier-url https://api.monadscan.com/api \
 *   -vvvv
 */
contract DeployMainnet is Script {

    // Monad Mainnet Protocol Addresses
    address constant WMON = 0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A;
    address constant ENTRYPOINT = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;

    // IMPORTANT: Update these addresses after deploying core contracts
    // or set via environment variables
    address public PASSPORT_NFT;
    address public TOURS_TOKEN;
    address public KEEPER;         // Safe multi-sig address
    address public BACKEND_WALLET; // EOA for signal recording

    function setUp() public {
        // Load addresses from environment or use defaults
        // These should be set after deploying core contracts
        PASSPORT_NFT = vm.envOr("PASSPORT_NFT", address(0));
        TOURS_TOKEN = vm.envOr("TOURS_TOKEN", address(0));
        KEEPER = vm.envOr("KEEPER", address(0));
        BACKEND_WALLET = vm.envOr("BACKEND_WALLET", address(0));
    }

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("==============================================");
        console.log("DEPLOYING EMPOWERTOURS CONTRACTS TO MAINNET");
        console.log("Network: Monad Mainnet (Chain ID: 143)");
        console.log("==============================================");
        console.log("");
        console.log("Deployer Address:", deployer);
        console.log("Deployer Balance:", deployer.balance / 1 ether, "MON");
        console.log("");
        console.log("Protocol Addresses:");
        console.log("  WMON:       ", WMON);
        console.log("  EntryPoint: ", ENTRYPOINT);
        console.log("");

        // Validate required addresses
        require(PASSPORT_NFT != address(0), "PASSPORT_NFT address not set");
        require(TOURS_TOKEN != address(0), "TOURS_TOKEN address not set");
        require(KEEPER != address(0), "KEEPER address not set");
        require(BACKEND_WALLET != address(0), "BACKEND_WALLET address not set");

        console.log("Configuration:");
        console.log("  TOURS Token:    ", TOURS_TOKEN);
        console.log("  Passport NFT:   ", PASSPORT_NFT);
        console.log("  Keeper (Safe):  ", KEEPER);
        console.log("  Backend Wallet: ", BACKEND_WALLET);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // ============================================
        // 1. Deploy ActionBasedDemandSignal
        // ============================================
        console.log("1/5 Deploying ActionBasedDemandSignal...");
        ActionBasedDemandSignal demandSignal = new ActionBasedDemandSignal(KEEPER);
        console.log("    Deployed at:", address(demandSignal));

        // Authorize backend wallet to record action signals
        console.log("    Authorizing backend wallet:", BACKEND_WALLET);
        demandSignal.authorizeContract(BACKEND_WALLET, true);
        console.log("    Backend wallet authorized!");
        console.log("");

        // ============================================
        // 2. Deploy ItineraryNFT
        // ============================================
        console.log("2/5 Deploying ItineraryNFT...");
        ItineraryNFT itineraryNFT = new ItineraryNFT(
            PASSPORT_NFT,
            TOURS_TOKEN
        );
        console.log("    Deployed at:", address(itineraryNFT));
        console.log("");

        // ============================================
        // 3. Deploy MusicBeatMatch
        // ============================================
        console.log("3/5 Deploying MusicBeatMatch...");
        MusicBeatMatch beatMatch = new MusicBeatMatch(
            TOURS_TOKEN,
            KEEPER
        );
        console.log("    Deployed at:", address(beatMatch));
        console.log("");

        // ============================================
        // 4. Deploy CountryCollector
        // ============================================
        console.log("4/5 Deploying CountryCollector...");
        CountryCollector countryCollector = new CountryCollector(
            TOURS_TOKEN,
            PASSPORT_NFT,
            KEEPER
        );
        console.log("    Deployed at:", address(countryCollector));
        console.log("");

        // ============================================
        // 5. Deploy TandaPool
        // ============================================
        console.log("5/5 Deploying TandaPool...");
        TandaPool tandaPool = new TandaPool(TOURS_TOKEN);
        console.log("    Deployed at:", address(tandaPool));
        console.log("");

        vm.stopBroadcast();

        // ============================================
        // Summary
        // ============================================
        console.log("==============================================");
        console.log("MAINNET DEPLOYMENT SUMMARY");
        console.log("==============================================");
        console.log("");
        console.log("Mini-App Contracts Deployed:");
        console.log("  ActionBasedDemandSignal:", address(demandSignal));
        console.log("  ItineraryNFT:           ", address(itineraryNFT));
        console.log("  MusicBeatMatch:         ", address(beatMatch));
        console.log("  CountryCollector:       ", address(countryCollector));
        console.log("  TandaPool:              ", address(tandaPool));
        console.log("");
        console.log("==============================================");
        console.log("NEXT STEPS");
        console.log("==============================================");
        console.log("");
        console.log("1. Verify all contracts on Monadscan:");
        console.log("   https://monadscan.com");
        console.log("");
        console.log("2. Update .env.mainnet with new addresses:");
        console.log("");
        console.log("   NEXT_PUBLIC_ACTION_BASED_DEMAND_SIGNAL=", address(demandSignal));
        console.log("   NEXT_PUBLIC_ITINERARY_NFT=", address(itineraryNFT));
        console.log("   NEXT_PUBLIC_MUSIC_BEAT_MATCH=", address(beatMatch));
        console.log("   NEXT_PUBLIC_COUNTRY_COLLECTOR=", address(countryCollector));
        console.log("   NEXT_PUBLIC_TANDA_POOL=", address(tandaPool));
        console.log("");
        console.log("3. Transfer ownership to multi-sig if not already");
        console.log("");
        console.log("4. Fund contracts with initial TOURS tokens");
        console.log("");
        console.log("5. Test all user flows on mainnet");
        console.log("");
        console.log("==============================================");
        console.log("MAINNET DEPLOYMENT COMPLETE!");
        console.log("Chain ID: 143 | Explorer: https://monadscan.com");
        console.log("==============================================");
    }
}
