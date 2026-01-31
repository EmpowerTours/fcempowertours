// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../EmpowerToursTimelock.sol";

/**
 * @notice Setup governance roles after deployment:
 *   1. Grant PROPOSER_ROLE to Governor on Timelock
 *   2. Renounce deployer's admin on Timelock
 *   3. Set Timelock as DAO timelock on ToursTokenV2
 *
 * Usage:
 *   forge script script/SetupGovernance.s.sol:SetupGovernance \
 *     --rpc-url monad --broadcast \
 *     -vvvv
 *
 * Requires env vars:
 *   DEPLOYER_PRIVATE_KEY
 *   GOVERNOR_ADDRESS
 *   TIMELOCK_ADDRESS
 *   (TOURS_TOKEN not needed — V1 token has no setDAOTimelock)
 */
contract SetupGovernance is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address governor = vm.envAddress("GOVERNOR_ADDRESS");
        address timelockAddr = vm.envAddress("TIMELOCK_ADDRESS");

        EmpowerToursTimelock timelock = EmpowerToursTimelock(payable(timelockAddr));

        vm.startBroadcast(deployerKey);

        // 1. Grant PROPOSER_ROLE to Governor
        bytes32 proposerRole = timelock.PROPOSER_ROLE();
        timelock.grantRole(proposerRole, governor);
        console.log("Granted PROPOSER_ROLE to Governor:", governor);

        // 2. Grant CANCELLER_ROLE to Governor
        bytes32 cancellerRole = timelock.CANCELLER_ROLE();
        timelock.grantRole(cancellerRole, governor);
        console.log("Granted CANCELLER_ROLE to Governor:", governor);

        // 3. Renounce DEFAULT_ADMIN_ROLE from deployer
        bytes32 adminRole = timelock.DEFAULT_ADMIN_ROLE();
        timelock.renounceRole(adminRole, deployer);
        console.log("Renounced DEFAULT_ADMIN_ROLE from deployer:", deployer);

        // Step 4 skipped: mainnet TOURS is V1 (ToursToken), no setDAOTimelock

        vm.stopBroadcast();

        console.log("");
        console.log("=== GOVERNANCE SETUP COMPLETE ===");
        console.log("Governor has PROPOSER + CANCELLER roles on Timelock");
        console.log("Deployer admin role renounced on Timelock");
    }
}
