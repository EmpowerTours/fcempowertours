// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../contracts/EmpowerToursYieldStrategyV4.sol";

contract DeployV4 is Script {
    function run() external {
        // Constructor parameters (checksummed)
        address TOURS_TOKEN = 0x96aD3dEa5D1a4D3Db4e8bb7e86f0e47F02E1c48B;
        address KINTSU = 0xe1d2439b75fb9746E7Bc6cB777Ae10AA7f7ef9c5;
        address TOKEN_SWAP = 0x66090C97F4f57C8f3cB5Bec90Ab35f8Fa68DE1E2;
        address DRAGON_ROUTER = 0xc57c80C43C0dAf5c40f4eb37e6db32dBFA2f09ea;
        address KEEPER = 0xe67e13D545C76C2b4e28DFE27Ad827E1FC18e8D9;

        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        EmpowerToursYieldStrategyV4 yieldStrategy = new EmpowerToursYieldStrategyV4(
            TOURS_TOKEN,
            KINTSU,
            TOKEN_SWAP,
            DRAGON_ROUTER,
            KEEPER
        );

        console.log("V4 deployed to:", address(yieldStrategy));

        vm.stopBroadcast();
    }
}
