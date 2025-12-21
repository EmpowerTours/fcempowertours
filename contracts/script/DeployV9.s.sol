// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../contracts/EmpowerToursYieldStrategyV9.sol";

/**
 * @title Deploy YieldStrategy V9
 * @notice Foundry deployment script for EmpowerToursYieldStrategyV9
 * @dev Run with: forge script contracts/script/DeployV9.s.sol:DeployV9 --rpc-url monad_testnet --broadcast --verify -vvvv
 */
contract DeployV9 is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        // Constructor arguments
        address toursToken = 0xa123600c82E69cB311B0e068B06Bfa9F787699B7;
        address kintsu = 0xe1d2439b75fb9746E7Bc6cB777Ae10AA7f7ef9c5; // ✅ Kintsu V2 from official docs
        address tokenSwap = 0xe004F2eaCd0AD74E14085929337875b20975F0AA;
        address dragonRouter = 0x00EA77CfCD29d461250B85D3569D0E235d8Fbd1e;
        address keeper = 0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20;

        console.log("===========================================");
        console.log("Deploying YieldStrategy V9 to Monad Testnet");
        console.log("===========================================");
        console.log("");
        console.log("Constructor arguments:");
        console.log("  TOURS Token:", toursToken);
        console.log("  Kintsu V2:", kintsu);
        console.log("  Token Swap:", tokenSwap);
        console.log("  Dragon Router:", dragonRouter);
        console.log("  Keeper:", keeper);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        EmpowerToursYieldStrategyV9 yieldStrategy = new EmpowerToursYieldStrategyV9(
            toursToken,
            kintsu,
            tokenSwap,
            dragonRouter,
            keeper
        );

        vm.stopBroadcast();

        console.log("");
        console.log("===========================================");
        console.log("DEPLOYMENT SUCCESSFUL");
        console.log("===========================================");
        console.log("");
        console.log("YieldStrategy V9 deployed to:", address(yieldStrategy));
        console.log("");
        console.log("Next steps:");
        console.log("1. Update .env.local with:");
        console.log("   NEXT_PUBLIC_YIELD_STRATEGY=", address(yieldStrategy));
        console.log("");
        console.log("2. Whitelist Passport NFT:");
        console.log("   cast send", address(yieldStrategy));
        console.log("   'whitelistNFT(address,bool)'");
        console.log("   0x54e935c5f1ec987bb87f36fc046cf13fb393acc8");
        console.log("   true");
        console.log("   --private-key $DEPLOYER_PRIVATE_KEY");
        console.log("   --rpc-url monad_testnet");
        console.log("");
    }
}
