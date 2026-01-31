// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/governance/TimelockController.sol";

/**
 * @title EmpowerToursTimelock
 * @notice TimelockController for EmpowerTours DAO governance.
 * @dev minDelay: 2 days.
 *      proposers: [Governor] — set after Governor deployment.
 *      executors: [address(0)] — anyone can execute once timelock expires.
 *      admin: deployer initially, renounced after setup.
 */
contract EmpowerToursTimelock is TimelockController {
    uint256 public constant MIN_TIMELOCK_DELAY = 2 days;

    constructor(address admin)
        TimelockController(
            MIN_TIMELOCK_DELAY,
            new address[](0), // proposers set after Governor deploy
            _executors(),
            admin
        )
    {}

    function _executors() private pure returns (address[] memory) {
        address[] memory executors = new address[](1);
        executors[0] = address(0); // anyone can execute after delay
        return executors;
    }
}
