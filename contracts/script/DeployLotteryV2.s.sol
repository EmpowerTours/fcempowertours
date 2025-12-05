// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../contracts/DailyPassLotteryV2.sol";

/**
 * @title DeployLotteryV2
 * @notice Deploy DailyPassLotteryV2 to Monad Testnet
 *
 * Usage:
 *   # Deploy to Monad Testnet
 *   forge script script/DeployLotteryV2.s.sol:DeployLotteryV2 \
 *     --rpc-url https://testnet-rpc.monad.xyz \
 *     --broadcast \
 *     --verify
 *
 *   # Or using environment variable
 *   forge script script/DeployLotteryV2.s.sol:DeployLotteryV2 \
 *     --rpc-url $NEXT_PUBLIC_MONAD_RPC \
 *     --private-key $DEPLOYER_PRIVATE_KEY \
 *     --broadcast
 */
contract DeployLotteryV2 is Script {
    // Platform Safe - receives 5% of entry fees for gas funding
    address constant PLATFORM_SAFE = 0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20;

    // Platform Wallet - receives 5% of entry fees for treasury
    address constant PLATFORM_WALLET = 0x33fFCcb1802e13a7eead232BCd4706a2269582b0;

    // shMON liquid staking token (Monad Testnet)
    address constant SHMON_TOKEN = 0x3a98250F98Dd388C211206983453837C8365BDc1;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("=== DEPLOYING DAILY PASS LOTTERY V2 TO MONAD TESTNET ===");
        console.log("Deployer:", deployer);
        console.log("Platform Safe (gas funding):", PLATFORM_SAFE);
        console.log("Platform Wallet (treasury):", PLATFORM_WALLET);
        console.log("shMON Token:", SHMON_TOKEN);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        DailyPassLotteryV2 lottery = new DailyPassLotteryV2(
            PLATFORM_SAFE,
            PLATFORM_WALLET,
            SHMON_TOKEN
        );

        vm.stopBroadcast();

        console.log("\n=== DEPLOYMENT COMPLETE ===");
        console.log("DailyPassLotteryV2:", address(lottery));
        console.log("Owner:", lottery.owner());
        console.log("Entry fee:", lottery.ENTRY_FEE() / 1e18, "MON");
        console.log("Platform Safe fee:", lottery.PLATFORM_SAFE_FEE_BPS() / 100, "%");
        console.log("Platform Wallet fee:", lottery.PLATFORM_WALLET_FEE_BPS() / 100, "%");
        console.log("Prize pool:", lottery.PRIZE_POOL_BPS() / 100, "%");
        console.log("shMON enabled:", lottery.shMonEnabled());

        // Get current round info
        (
            uint256 currentRoundId,
            uint256 prizePoolMon,
            uint256 prizePoolShMon,
            uint256 participants,
            ,
            ,

        ) = lottery.getStats();

        console.log("\nCurrent Round:", currentRoundId);
        console.log("Prize Pool (MON):", prizePoolMon / 1e18, "MON");
        console.log("Prize Pool (shMON):", prizePoolShMon / 1e18, "shMON");
        console.log("Participants:", participants);

        console.log("\nNext steps:");
        console.log("1. Update .env.local:");
        console.log("   NEXT_PUBLIC_LOTTERY_ADDRESS=", address(lottery));
        console.log("");
        console.log("2. Update app/api/execute-delegated/route.ts:");
        console.log("   - Change LOTTERY_ADDRESS to:", address(lottery));
        console.log("   - Update to call enterWithMonFor(beneficiary) instead of enterWithMon()");
        console.log("");
        console.log("3. Test delegation:");
        console.log("   - Platform Safe should be able to enter on behalf of users");
        console.log("   - Each user should only be able to enter once per round");
        console.log("   - Fees should be split: 5% Platform Safe + 5% Platform Wallet + 90% Prize");
    }
}
