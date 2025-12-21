// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {WMON} from "../contracts/WMON.sol";
import {SimpleLiquidityPool} from "../contracts/SimpleLiquidityPool.sol";

contract DeployAMM is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address toursToken = vm.envAddress("TOURS_TOKEN");

        console2.log("=== Deploying AMM Contracts ===");
        console2.log("Deployer:", vm.addr(deployerPrivateKey));
        console2.log("TOURS Token:", toursToken);

        vm.startBroadcast(deployerPrivateKey);

        // Deploy WMON
        WMON wmon = new WMON();
        console2.log("\nWMON deployed at:", address(wmon));

        // Deploy SimpleLiquidityPool
        SimpleLiquidityPool pool = new SimpleLiquidityPool(
            toursToken,
            address(wmon)
        );
        console2.log("SimpleLiquidityPool deployed at:", address(pool));

        console2.log("\n=== Deployment Complete ===");
        console2.log("\nAdd to .env:");
        console2.log("WMON=", address(wmon));
        console2.log("TOURS_WMON_POOL=", address(pool));

        vm.stopBroadcast();
    }
}
