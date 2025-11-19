// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {SimpleLiquidityPool} from "../contracts/SimpleLiquidityPool.sol";

contract DeployAMMWithOfficialWMON is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address toursToken = vm.envAddress("TOURS_TOKEN");
        address officialWMON = 0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701; // Official WMON

        console2.log("=== Deploying AMM Pool with Official WMON ===");
        console2.log("Deployer:", vm.addr(deployerPrivateKey));
        console2.log("TOURS Token:", toursToken);
        console2.log("Official WMON:", officialWMON);

        vm.startBroadcast(deployerPrivateKey);

        // Deploy SimpleLiquidityPool with official WMON
        SimpleLiquidityPool pool = new SimpleLiquidityPool(
            toursToken,
            officialWMON
        );
        console2.log("\nSimpleLiquidityPool deployed at:", address(pool));

        console2.log("\n=== Deployment Complete ===");
        console2.log("\nUpdate .env:");
        console2.log("NEXT_PUBLIC_WMON=", officialWMON);
        console2.log("NEXT_PUBLIC_TOURS_WMON_POOL=", address(pool));

        vm.stopBroadcast();
    }
}
