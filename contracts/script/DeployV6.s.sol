// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../contracts/EmpowerToursYieldStrategyV6.sol";

contract DeployV6 is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        // Constructor arguments
        address toursToken = 0xa123600c82E69cB311B0e068B06Bfa9F787699B7;
        address kintsu = 0xe1d2439b75fb9746E7Bc6cB777Ae10AA7f7ef9c5; // ✅ CORRECT Kintsu address from official docs
        address tokenSwap = 0xe004F2eaCd0AD74E14085929337875b20975F0AA;
        address dragonRouter = 0x00EA77CfCD29d461250B85D3569D0E235d8Fbd1e;
        address keeper = 0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20;

        vm.startBroadcast(deployerPrivateKey);

        EmpowerToursYieldStrategyV6 yieldStrategy = new EmpowerToursYieldStrategyV6(
            toursToken,
            kintsu,
            tokenSwap,
            dragonRouter,
            keeper
        );

        vm.stopBroadcast();

        console.log("YieldStrategy V6 deployed to:", address(yieldStrategy));
    }
}
