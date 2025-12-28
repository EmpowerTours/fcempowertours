// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/EmpowerToursDAO.sol";
import "../src/VotingTOURS.sol";
import "@openzeppelin/contracts/governance/utils/IVotes.sol";

contract DeployEmpowerToursDAO is Script {
    function run() external {
        address toursToken = 0x46d048EB424b0A95d5185f39C760c5FA754491d0;
        uint256 minDelay = 2 days;

        console.log("=== Deploying EmpowerTours DAO System ===");
        console.log("");
        console.log("TOURS Token:", toursToken);
        console.log("Timelock Delay:", minDelay / 1 days, "days");
        console.log("");

        vm.startBroadcast();

        // Step 1: Deploy VotingTOURS wrapper
        VotingTOURS vTours = new VotingTOURS(toursToken);
        console.log("VotingTOURS (vTOURS) deployed to:", address(vTours));

        // Step 2: Deploy Timelock
        address[] memory proposers = new address[](0);
        address[] memory executors = new address[](1);
        executors[0] = address(0); // Anyone can execute after delay

        EmpowerToursTimelock timelock = new EmpowerToursTimelock(
            minDelay,
            proposers,
            executors,
            msg.sender
        );
        console.log("Timelock deployed to:", address(timelock));

        // Step 3: Deploy Governor with vTOURS as voting token
        EmpowerToursDAO dao = new EmpowerToursDAO(
            IVotes(address(vTours)),
            timelock
        );
        console.log("EmpowerToursDAO deployed to:", address(dao));

        // Step 4: Setup roles
        bytes32 PROPOSER_ROLE = timelock.PROPOSER_ROLE();
        bytes32 CANCELLER_ROLE = timelock.CANCELLER_ROLE();
        bytes32 ADMIN_ROLE = timelock.DEFAULT_ADMIN_ROLE();

        timelock.grantRole(PROPOSER_ROLE, address(dao));
        timelock.grantRole(CANCELLER_ROLE, address(dao));
        timelock.renounceRole(ADMIN_ROLE, msg.sender);

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployment Complete ===");
        console.log("");
        console.log("Contracts:");
        console.log("  VotingTOURS:", address(vTours));
        console.log("  Timelock:", address(timelock));
        console.log("  DAO:", address(dao));
        console.log("");
        console.log("DAO Settings:");
        console.log("  Voting Delay: 7200 blocks (~1 day)");
        console.log("  Voting Period: 50400 blocks (~1 week)");
        console.log("  Proposal Threshold: 100 vTOURS");
        console.log("  Quorum: 4% of vTOURS supply");
        console.log("  Execution Delay: 2 days");
        console.log("");
        console.log("How to participate:");
        console.log("  1. Wrap TOURS: vTours.wrap(amount)");
        console.log("  2. Delegate votes: vTours.delegate(yourAddress)");
        console.log("  3. Or do both: vTours.wrapAndDelegate(amount, yourAddress)");
        console.log("");
        console.log("To connect DAO to MusicSubscriptionV2:");
        console.log("  subscription.transferOwnership(", address(timelock), ")");
    }
}
