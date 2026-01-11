// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/SponsorWhitelist.sol";
import "../src/EventOracleLite.sol";

/**
 * @title DeployEventOracle
 * @notice Deploys Event Oracle Lite for testnet (La Mille Gala)
 *
 * Deploy command:
 * forge script script/DeployEventOracle.s.sol:DeployEventOracle \
 *   --rpc-url https://testnet-rpc.monad.xyz \
 *   --broadcast \
 *   --legacy
 */
contract DeployEventOracle is Script {

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deploying Event Oracle Lite (testnet)...");
        console.log("Deployer:", deployer);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy SponsorWhitelist
        SponsorWhitelist sponsorWhitelist = new SponsorWhitelist();
        console.log("SponsorWhitelist deployed at:", address(sponsorWhitelist));

        // 2. Deploy EventOracleLite
        EventOracleLite eventOracle = new EventOracleLite();
        console.log("EventOracleLite deployed at:", address(eventOracle));

        // 3. Set EventOracleLite as trusted stamp source in SponsorWhitelist
        sponsorWhitelist.addTrustedStampSource(address(eventOracle));
        console.log("EventOracleLite added as trusted stamp source");

        vm.stopBroadcast();

        console.log("");
        console.log("=== DEPLOYMENT COMPLETE ===");
        console.log("SponsorWhitelist:", address(sponsorWhitelist));
        console.log("EventOracleLite:", address(eventOracle));
        console.log("");
        console.log("Add to .env.local:");
        console.log("NEXT_PUBLIC_SPONSOR_WHITELIST=", address(sponsorWhitelist));
        console.log("NEXT_PUBLIC_EVENT_ORACLE=", address(eventOracle));
    }
}
