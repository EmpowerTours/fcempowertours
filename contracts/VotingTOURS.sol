// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Wrapper.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/**
 * @title VotingTOURS (vTOURS)
 * @notice Wraps TOURS 1:1 into voting-enabled vTOURS for DAO governance.
 * @dev Uses ERC20Wrapper to wrap/unwrap, ERC20Votes for delegation & checkpointing,
 *      and ERC20Permit for gasless approvals.
 */
contract VotingTOURS is ERC20Wrapper, ERC20Votes, ERC20Permit {
    constructor(IERC20 _tours)
        ERC20("Voting TOURS", "vTOURS")
        ERC20Permit("Voting TOURS")
        ERC20Wrapper(_tours)
    {}

    /**
     * @notice Convenience: wrap TOURS and delegate voting power in one call.
     * @param amount Amount of TOURS to wrap
     * @param delegatee Address to delegate voting power to
     */
    function wrapAndDelegate(uint256 amount, address delegatee) external {
        depositFor(msg.sender, amount);
        delegate(delegatee);
    }

    /**
     * @notice Unwrap vTOURS back to TOURS (alias for withdrawTo to self).
     * @param amount Amount of vTOURS to unwrap
     */
    function unwrap(uint256 amount) external {
        withdrawTo(msg.sender, amount);
    }

    // ============================================
    // Required overrides for multiple inheritance
    // ============================================

    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Votes)
    {
        super._update(from, to, value);
    }

    function decimals() public view override(ERC20, ERC20Wrapper) returns (uint8) {
        return super.decimals();
    }

    function nonces(address owner) public view override(ERC20Permit, Nonces) returns (uint256) {
        return super.nonces(owner);
    }
}
