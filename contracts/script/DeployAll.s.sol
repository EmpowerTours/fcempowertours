// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {PersonalAssistantV1} from "../contracts/PersonalAssistantV1.sol";
import {ServiceMarketplace} from "../contracts/ServiceMarketplace.sol";
import {MusicBeatMatchV2} from "../contracts/MusicBeatMatchV2.sol";
import {CountryCollectorV2} from "../contracts/CountryCollectorV2.sol";
import {ExperienceNFT} from "../contracts/ExperienceNFT.sol";

/**
 * @title DeployAll
 * @notice Deploy and verify all 5 new contracts in one transaction
 * @dev Deploys PersonalAssistantV1, ServiceMarketplace, MusicBeatMatchV2, CountryCollectorV2, ExperienceNFT
 *
 * Prerequisites:
 *   - Set DEPLOYER_PRIVATE_KEY in .env
 *   - Deployer wallet must have enough MON for gas (~10-15 MON)
 *
 * Usage:
 *   forge script script/DeployAll.s.sol:DeployAll \
 *     --rpc-url https://testnet-rpc.monad.xyz \
 *     --broadcast \
 *     --verify \
 *     --verifier sourcify \
 *     --verifier-url https://sourcify.monad.xyz
 */
contract DeployAll is Script {

    // Monad Testnet addresses
    address constant WMON_TOKEN = 0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701;
    address constant TOURS_TOKEN = 0xa123600c82E69cB311B0e068B06Bfa9F787699B7;
    address constant PLATFORM_SAFE = 0x33fFCcb1802e13a7eead232BCd4706a2269582b0;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);

        console.log("=================================================");
        console.log("DEPLOYING ALL 5 CONTRACTS");
        console.log("=================================================");
        console.log("Deployer:      ", deployer);
        console.log("WMON Token:    ", WMON_TOKEN);
        console.log("TOURS Token:   ", TOURS_TOKEN);
        console.log("Platform Safe: ", PLATFORM_SAFE);
        console.log("");

        // ===================================
        // 1. Deploy PersonalAssistantV1
        // ===================================
        console.log("1/5 Deploying PersonalAssistantV1...");
        PersonalAssistantV1 personalAssistant = new PersonalAssistantV1(PLATFORM_SAFE);
        console.log("    Address: ", address(personalAssistant));
        console.log("    DONE");
        console.log("");

        // ===================================
        // 2. Deploy ServiceMarketplace
        // ===================================
        console.log("2/5 Deploying ServiceMarketplace...");
        ServiceMarketplace marketplace = new ServiceMarketplace(
            WMON_TOKEN,
            PLATFORM_SAFE,
            address(personalAssistant)
        );
        console.log("    Address: ", address(marketplace));
        console.log("    DONE");
        console.log("");

        // ===================================
        // 3. Deploy MusicBeatMatchV2
        // ===================================
        console.log("3/5 Deploying MusicBeatMatchV2...");
        MusicBeatMatchV2 beatMatch = new MusicBeatMatchV2(
            WMON_TOKEN,
            TOURS_TOKEN
        );
        console.log("    Address: ", address(beatMatch));
        console.log("    DONE");
        console.log("");

        // ===================================
        // 4. Deploy CountryCollectorV2
        // ===================================
        console.log("4/5 Deploying CountryCollectorV2...");
        CountryCollectorV2 countryCollector = new CountryCollectorV2(
            WMON_TOKEN,
            TOURS_TOKEN
        );
        console.log("    Address: ", address(countryCollector));
        console.log("    DONE");
        console.log("");

        // ===================================
        // 5. Deploy ExperienceNFT
        // ===================================
        console.log("5/5 Deploying ExperienceNFT...");
        ExperienceNFT experienceNFT = new ExperienceNFT(WMON_TOKEN);
        console.log("    Address: ", address(experienceNFT));
        console.log("    DONE");
        console.log("");

        vm.stopBroadcast();

        // ===================================
        // DEPLOYMENT SUMMARY
        // ===================================
        console.log("=================================================");
        console.log("DEPLOYMENT COMPLETE!");
        console.log("=================================================");
        console.log("");
        console.log("CONTRACT ADDRESSES:");
        console.log("-------------------------------------------------");
        console.log("PersonalAssistantV1:  ", address(personalAssistant));
        console.log("ServiceMarketplace:   ", address(marketplace));
        console.log("MusicBeatMatchV2:     ", address(beatMatch));
        console.log("CountryCollectorV2:   ", address(countryCollector));
        console.log("ExperienceNFT:        ", address(experienceNFT));
        console.log("-------------------------------------------------");
        console.log("");
        console.log("NEXT STEPS:");
        console.log("");
        console.log("1. Verify all contracts completed on MonadScan/Sourcify");
        console.log("");
        console.log("2. Add to Railway environment variables:");
        console.log("");
        console.log("NEXT_PUBLIC_PERSONAL_ASSISTANT=%s", address(personalAssistant));
        console.log("NEXT_PUBLIC_SERVICE_MARKETPLACE=%s", address(marketplace));
        console.log("NEXT_PUBLIC_MUSIC_BEAT_MATCH_V2=%s", address(beatMatch));
        console.log("NEXT_PUBLIC_COUNTRY_COLLECTOR_V2=%s", address(countryCollector));
        console.log("NEXT_PUBLIC_EXPERIENCE_NFT=%s", address(experienceNFT));
        console.log("");
        console.log("3. Update .env.local with the same addresses");
        console.log("");
        console.log("4. Test core functions:");
        console.log("   - PersonalAssistant: Register assistants");
        console.log("   - ServiceMarketplace: Create food/ride orders");
        console.log("   - MusicBeatMatch: Create daily challenge");
        console.log("   - CountryCollector: Add artist-country pairs");
        console.log("   - ExperienceNFT: Create GPS-hidden experience");
        console.log("");
        console.log("5. Fund ExperienceNFT with WMON for completion rewards");
        console.log("   (if you want users to earn rewards)");
        console.log("");
        console.log("=================================================");
    }
}
