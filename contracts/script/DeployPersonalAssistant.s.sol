// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {PersonalAssistantV1} from "../contracts/PersonalAssistantV1.sol";

contract DeployPersonalAssistant is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address platformSafe = vm.envAddress("PLATFORM_SAFE_ADDRESS");

        console.log("========================================");
        console.log("DEPLOYING PERSONAL ASSISTANT CONTRACT");
        console.log("========================================");
        console.log("Platform Safe:", platformSafe);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        PersonalAssistantV1 personalAssistant = new PersonalAssistantV1(platformSafe);

        vm.stopBroadcast();

        console.log("========================================");
        console.log("DEPLOYMENT COMPLETE!");
        console.log("========================================");
        console.log("PersonalAssistantV1:", address(personalAssistant));
        console.log("");
        console.log("NEXT STEPS:");
        console.log("1. Verify contract on MonadScan/Sourcify");
        console.log("2. Add to .env.local:");
        console.log("   NEXT_PUBLIC_PERSONAL_ASSISTANT=%s", address(personalAssistant));
        console.log("3. Add delegation routes to execute-delegated API");
        console.log("4. Build registration UI");
        console.log("5. Build admin verification dashboard");
        console.log("========================================");
    }
}
