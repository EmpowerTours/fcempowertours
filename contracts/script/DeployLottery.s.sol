// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../DailyLottery.sol";

/**
 * @notice Deploy DailyLottery contract.
 *
 * Usage:
 *   forge script script/DeployLottery.s.sol:DeployLottery \
 *     --rpc-url monad --broadcast --verify \
 *     -vvvv
 *
 * Requires env vars:
 *   DEPLOYER_PRIVATE_KEY
 *   WMON_ADDRESS             (Wrapped MON token)
 *   TOURS_REWARD_MANAGER     (ToursRewardManager contract)
 *   ENTROPY_ADDRESS          (Pyth Entropy contract on Monad)
 *   TREASURY_ADDRESS         (DAO treasury for 5% share)
 */
contract DeployLottery is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        address wmon = vm.envAddress("WMON_ADDRESS");
        address toursRewardManager = vm.envAddress("TOURS_REWARD_MANAGER");
        address entropyAddr = vm.envAddress("ENTROPY_ADDRESS");
        address treasury = vm.envAddress("TREASURY_ADDRESS");

        console.log("Deploying DailyLottery...");
        console.log("  Deployer:           ", deployer);
        console.log("  WMON:               ", wmon);
        console.log("  ToursRewardManager: ", toursRewardManager);
        console.log("  Entropy:            ", entropyAddr);
        console.log("  Treasury:           ", treasury);

        vm.startBroadcast(deployerKey);

        DailyLottery lottery = new DailyLottery(
            wmon,
            toursRewardManager,
            entropyAddr,
            treasury
        );

        console.log("DailyLottery deployed:", address(lottery));

        vm.stopBroadcast();

        console.log("");
        console.log("=== LOTTERY DEPLOYED ===");
        console.log("Contract:     ", address(lottery));
        console.log("Ticket Price: 2 WMON");
        console.log("Min Entries:  5");
        console.log("Winner Share: 90%");
        console.log("Treasury:     5%");
        console.log("Deployer:     5%");
        console.log("");
        console.log("NEXT STEPS:");
        console.log("  1. Register DailyLottery as distributor in ToursRewardManager:");
        console.log("     rewardManager.setDistributor(address(lottery), true)");
        console.log("  2. Add to Envio indexer (schema + handlers)");
        console.log("  3. Set NEXT_PUBLIC_DAILY_LOTTERY in .env");
        console.log("  4. Add lottery actions to execute-delegated");
        console.log("  5. Update SKILL.md with lottery endpoints");
    }
}
