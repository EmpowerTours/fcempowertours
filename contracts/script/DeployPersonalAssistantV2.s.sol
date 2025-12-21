// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {PersonalAssistantV2} from "../contracts/PersonalAssistantV2.sol";

contract DeployPersonalAssistantV2 is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address platformSafe = vm.envAddress("PLATFORM_SAFE_ADDRESS");

        console.log("========================================");
        console.log("DEPLOYING PERSONAL ASSISTANT V2 CONTRACT");
        console.log("========================================");
        console.log("Platform Safe:", platformSafe);
        console.log("");
        console.log("V2 IMPROVEMENTS:");
        console.log("- Added createServiceRequestFor() for delegation");
        console.log("- Farcaster wallet users can create requests gaslessly");
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        PersonalAssistantV2 personalAssistant = new PersonalAssistantV2(platformSafe);

        vm.stopBroadcast();

        console.log("========================================");
        console.log("DEPLOYMENT COMPLETE!");
        console.log("========================================");
        console.log("PersonalAssistantV2:", address(personalAssistant));
        console.log("");
        console.log("NEXT STEPS:");
        console.log("1. Verify contract on MonadScan with Sourcify:");
        console.log("   forge verify-contract %s PersonalAssistantV2 --verifier sourcify --verifier-url https://sourcify.monad.xyz", address(personalAssistant));
        console.log("2. Update src/config/contracts.ts:");
        console.log("   PersonalAssistantV2: { address: '%s' }", address(personalAssistant));
        console.log("3. Update delegation API to use new address");
        console.log("4. Test custom service requests with Farcaster wallet");
        console.log("========================================");
    }
}
