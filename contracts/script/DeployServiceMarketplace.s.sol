// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {ServiceMarketplace} from "../contracts/ServiceMarketplace.sol";

/**
 * @title DeployServiceMarketplace
 * @notice Foundry deployment script for ServiceMarketplace contract
 * @dev IMPORTANT: Deploy PersonalAssistantV1 FIRST before deploying ServiceMarketplace
 *
 * Usage:
 *   forge script script/DeployServiceMarketplace.s.sol:DeployServiceMarketplace \
 *     --rpc-url https://testnet-rpc.monad.xyz \
 *     --broadcast \
 *     --verify \
 *     --verifier sourcify \
 *     --verifier-url https://sourcify.monad.xyz
 */
contract DeployServiceMarketplace is Script {

    // Monad Testnet addresses
    address constant WMON_TOKEN = 0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701;
    address constant PLATFORM_SAFE = 0x33fFCcb1802e13a7eead232BCd4706a2269582b0;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address personalAssistant = vm.envAddress("PERSONAL_ASSISTANT_ADDRESS");

        require(personalAssistant != address(0), "PERSONAL_ASSISTANT_ADDRESS not set in .env");

        vm.startBroadcast(deployerPrivateKey);

        console.log("===========================================");
        console.log("DEPLOYING SERVICE MARKETPLACE");
        console.log("===========================================");
        console.log("WMON Token:", WMON_TOKEN);
        console.log("Platform Safe:", PLATFORM_SAFE);
        console.log("PersonalAssistant:", personalAssistant);
        console.log("");

        ServiceMarketplace marketplace = new ServiceMarketplace(
            WMON_TOKEN,
            PLATFORM_SAFE,
            personalAssistant
        );

        console.log("ServiceMarketplace deployed at:", address(marketplace));
        console.log("");
        console.log("===========================================");
        console.log("DEPLOYMENT COMPLETE!");
        console.log("===========================================");
        console.log("ServiceMarketplace:", address(marketplace));
        console.log("");
        console.log("NEXT STEPS:");
        console.log("1. Verify contract on MonadScan/Sourcify");
        console.log("2. Add to .env.local:");
        console.log("   NEXT_PUBLIC_SERVICE_MARKETPLACE=%s", address(marketplace));
        console.log("3. Only verified assistants can register as providers");
        console.log("4. All payments processed in WMON (USD-denominated)");
        console.log("5. Platform fees: 2-5% based on assistant verification tier");
        console.log("===========================================");

        vm.stopBroadcast();
    }
}
