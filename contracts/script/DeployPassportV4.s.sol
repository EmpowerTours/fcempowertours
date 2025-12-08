// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {PassportNFTv4} from "../contracts/PassportNFTv4.sol";

contract DeployPassportV4 is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address yieldStrategy = vm.envAddress("YIELD_STRATEGY_ADDRESS");

        console.log("Deploying PassportNFTv4...");
        console.log("Deployer:", vm.addr(deployerPrivateKey));
        console.log("YieldStrategy:", yieldStrategy);

        vm.startBroadcast(deployerPrivateKey);

        PassportNFTv4 passport = new PassportNFTv4(yieldStrategy);

        console.log("\n=================================");
        console.log("PassportNFTv4 deployed at:", address(passport));
        console.log("=================================\n");

        console.log("Anti-Spam Config:");
        console.log("- Base Mint Price:", passport.BASE_MINT_PRICE() / 1e18, "MON");
        console.log("- Cooldown Period:", passport.MINT_COOLDOWN() / 3600, "hours");
        console.log("- Progressive Pricing Divider:", passport.PROGRESSIVE_PRICE_DIVIDER());

        console.log("\nVerification:");
        console.log("- Owner (default verifier):", passport.owner());

        vm.stopBroadcast();

        // Save deployment info
        console.log("\nUpdate .env with:");
        console.log("NEXT_PUBLIC_PASSPORT_ADDRESS=", address(passport));
    }
}
