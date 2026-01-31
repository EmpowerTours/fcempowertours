// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../VotingTOURS.sol";
import "../EmpowerToursTimelock.sol";
import "../EmpowerToursGovernor.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @notice Deploy VotingTOURS, Timelock, and Governor.
 *
 * Usage:
 *   forge script script/DeployGovernance.s.sol:DeployGovernance \
 *     --rpc-url monad --broadcast --verify \
 *     -vvvv
 *
 * Requires:
 *   DEPLOYER_PRIVATE_KEY in env
 *   TOURS_TOKEN address in env
 */
contract DeployGovernance is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address toursToken = vm.envAddress("TOURS_TOKEN");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        // 1. Deploy VotingTOURS (wraps TOURS → vTOURS)
        VotingTOURS votingTours = new VotingTOURS(IERC20(toursToken));
        console.log("VotingTOURS deployed:", address(votingTours));

        // 2. Deploy Timelock (deployer as initial admin)
        EmpowerToursTimelock timelock = new EmpowerToursTimelock(deployer);
        console.log("Timelock deployed:", address(timelock));

        // 3. Deploy Governor (using vTOURS token and Timelock)
        EmpowerToursGovernor governor = new EmpowerToursGovernor(
            votingTours,
            timelock
        );
        console.log("Governor deployed:", address(governor));

        vm.stopBroadcast();

        console.log("");
        console.log("=== GOVERNANCE DEPLOYED ===");
        console.log("VotingTOURS:", address(votingTours));
        console.log("Timelock:   ", address(timelock));
        console.log("Governor:   ", address(governor));
        console.log("");
        console.log("NEXT: Run SetupGovernance.s.sol to grant roles and renounce admin.");
    }
}
