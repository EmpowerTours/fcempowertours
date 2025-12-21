// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../contracts/ActionBasedDemandSignal.sol";
import "../contracts/ItineraryNFT.sol";
import "../contracts/MusicBeatMatch.sol";
import "../contracts/CountryCollector.sol";
import "../contracts/TandaPool.sol";

/**
 * @title DeployComplete
 * @notice Complete deployment script for all EmpowerTours mini-app contracts
 * @dev Deploys: ActionBasedDemandSignal, ItineraryNFT, MusicBeatMatch, CountryCollector, TandaPool
 */
contract DeployComplete is Script {

    // Existing deployed contract addresses on Monad Testnet
    address constant PASSPORT_NFT_V3 = 0x820A9cc395D4349e19dB18BAc5Be7b3C71ac5163;
    address constant TOURS_TOKEN = 0xa123600c82E69cB311B0e068B06Bfa9F787699B7;
    address constant KEEPER = 0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20;  // Safe account
    address constant BACKEND_WALLET = 0x37302543aeF0b06202adcb06Db36daB05F8237E9;  // EOA for signal recording

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("==============================================");
        console.log("DEPLOYING EMPOWERTOURS CONTRACTS");
        console.log("Network: Monad Testnet");
        console.log("==============================================");
        console.log("");
        console.log("Deployer Address:", deployer);
        console.log("Deployer Balance:", deployer.balance / 1 ether, "MON");
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
            PASSPORT_NFT_V3,
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
            PASSPORT_NFT_V3,
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
        console.log("DEPLOYMENT SUMMARY");
        console.log("==============================================");
        console.log("");
        console.log("Mini-App Contracts Deployed:");
        console.log("  ActionBasedDemandSignal:", address(demandSignal));
        console.log("  ItineraryNFT:           ", address(itineraryNFT));
        console.log("  MusicBeatMatch:         ", address(beatMatch));
        console.log("  CountryCollector:       ", address(countryCollector));
        console.log("  TandaPool:              ", address(tandaPool));
        console.log("");
        console.log("Configuration:");
        console.log("  Keeper (Safe):          ", KEEPER);
        console.log("  Backend Wallet (EOA):   ", BACKEND_WALLET);
        console.log("  TOURS Token:            ", TOURS_TOKEN);
        console.log("  Passport NFT v3:        ", PASSPORT_NFT_V3);
        console.log("");
        console.log("==============================================");
        console.log("NEXT STEPS");
        console.log("==============================================");
        console.log("");
        console.log("1. See DEPLOYMENT.md for verification commands");
        console.log("2. Run ./script/FundContracts.sh to fund with TOURS");
        console.log("3. Update frontend environment variables:");
        console.log("");
        console.log("   NEXT_PUBLIC_ACTION_BASED_DEMAND_SIGNAL=", address(demandSignal));
        console.log("   NEXT_PUBLIC_ITINERARY_NFT=", address(itineraryNFT));
        console.log("   NEXT_PUBLIC_MUSIC_BEAT_MATCH=", address(beatMatch));
        console.log("   NEXT_PUBLIC_COUNTRY_COLLECTOR=", address(countryCollector));
        console.log("   NEXT_PUBLIC_TANDA_POOL=", address(tandaPool));
        console.log("");
        console.log("==============================================");
        console.log("DEPLOYMENT COMPLETE!");
        console.log("All 5 mini-app contracts deployed successfully");
        console.log("==============================================");
    }
}
