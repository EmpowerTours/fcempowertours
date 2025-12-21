// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../contracts/LotteryPayout.sol";

/**
 * @title DeployLotteryPayout
 * @notice Deploy LotteryPayout contract to Base
 *
 * Usage:
 *   # Deploy to Base mainnet
 *   forge script script/DeployLotteryPayout.s.sol:DeployLotteryPayout \
 *     --rpc-url https://mainnet.base.org \
 *     --broadcast \
 *     --verify
 */
contract DeployLotteryPayout is Script {
    // Platform wallet - receives 50% of entry fees
    address constant PLATFORM_WALLET = 0x33fFCcb1802e13a7eead232BCd4706a2269582b0;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("=== DEPLOYING LOTTERY PAYOUT TO BASE ===");
        console.log("Deployer:", deployer);
        console.log("Platform wallet:", PLATFORM_WALLET);

        vm.startBroadcast(deployerPrivateKey);

        LotteryPayout lottery = new LotteryPayout(PLATFORM_WALLET);

        vm.stopBroadcast();

        console.log("\n=== DEPLOYMENT COMPLETE ===");
        console.log("LotteryPayout:", address(lottery));
        console.log("Owner:", lottery.owner());
        console.log("Entry fee:", lottery.entryFee(), "wei (0.002 ETH)");
        console.log("\nNext steps:");
        console.log("1. Add to .env: LOTTERY_CONTRACT_BASE=", address(lottery));
        console.log("2. Fund your deployer wallet on Base for gas (~$5 ETH)");
        console.log("3. Update lottery code to use this contract");
    }
}
