// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../contracts/EmpowerToursYieldStrategyV3.sol";

contract DeployV3 is Script {
    function run() external {
        // Constructor arguments
        address TOURS_TOKEN = 0x96aD3dEa5D1a4D3Db4e8bb7e86f0e47F02E1c48B;
        address KINTSU = 0xe1d2439b75fb9746e7Bc6cB777Ae10AA7f7ef9c5;
        address TOKEN_SWAP = 0x66090c97f4f57c8f3cb5bec90ab35f8fa68de1e2;
        address DRAGON_ROUTER = 0xc57c80c43c0daf5c40f4eb37e6db32dbfa2f09ea;
        address KEEPER = 0xe67e13D545C76C2b4e28DFE27Ad827E1FC18e8D9;

        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        EmpowerToursYieldStrategyV3 strategy = new EmpowerToursYieldStrategyV3(
            TOURS_TOKEN,
            KINTSU,
            TOKEN_SWAP,
            DRAGON_ROUTER,
            KEEPER
        );

        vm.stopBroadcast();

        console.log("V3 Contract deployed to:", address(strategy));
        console.log("");
        console.log("Next steps:");
        console.log("1. Verify contract on Monadscan");
        console.log("2. Update YIELD_STRATEGY_V3 in .env");
        console.log("3. Whitelist Passport NFT: 0x54e935c5f1ec987bb87f36fc046cf13fb393acc8");
    }
}
