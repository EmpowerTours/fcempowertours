// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {ServiceMarketplace} from "../contracts/ServiceMarketplace.sol";

/**
 * @title DeployServiceMarketplace
 * @notice Foundry deployment script for ServiceMarketplace contract
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
    address constant TOURS_TOKEN = 0xa123600c82E69cB311B0e068B06Bfa9F787699B7;
    address constant PLATFORM_SAFE = 0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        console.log("Deploying ServiceMarketplace...");
        console.log("TOURS Token:", TOURS_TOKEN);
        console.log("Platform Safe:", PLATFORM_SAFE);

        ServiceMarketplace marketplace = new ServiceMarketplace(
            TOURS_TOKEN,
            PLATFORM_SAFE
        );

        console.log("ServiceMarketplace deployed at:", address(marketplace));
        console.log("");
        console.log("=== Deployment Summary ===");
        console.log("Contract:", address(marketplace));
        console.log("Owner:", marketplace.owner());
        console.log("Platform Fee:", marketplace.platformFeePercent(), "%");
        console.log("Dispute Window:", marketplace.disputeTimeWindow() / 1 hours, "hours");
        console.log("");
        console.log("=== Verify Command ===");
        console.log("Run this command to verify on MonadScan:");
        console.log(string(abi.encodePacked(
            "forge verify-contract ",
            vm.toString(address(marketplace)),
            " ServiceMarketplace ",
            "--verifier sourcify ",
            "--verifier-url https://sourcify.monad.xyz ",
            "--constructor-args $(cast abi-encode \"constructor(address,address)\" ",
            vm.toString(TOURS_TOKEN),
            " ",
            vm.toString(PLATFORM_SAFE),
            ")"
        )));

        vm.stopBroadcast();
    }
}
