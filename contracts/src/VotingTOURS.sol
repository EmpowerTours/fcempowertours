// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title VotingTOURS (vTOURS)
 * @notice Wrapped TOURS token with voting capability for DAO governance
 *
 * How it works:
 * 1. User wraps TOURS → receives vTOURS 1:1
 * 2. User delegates vTOURS to themselves or another address
 * 3. Delegated vTOURS = voting power in EmpowerToursDAO
 * 4. User can unwrap vTOURS → receives TOURS back 1:1
 *
 * Note: vTOURS must be delegated to count as votes!
 * Call delegate(yourAddress) after wrapping.
 */
contract VotingTOURS is ERC20, ERC20Permit, ERC20Votes {
    using SafeERC20 for IERC20;

    IERC20 public immutable tours;

    event Wrapped(address indexed user, uint256 amount);
    event Unwrapped(address indexed user, uint256 amount);

    constructor(address _tours)
        ERC20("Voting TOURS", "vTOURS")
        ERC20Permit("Voting TOURS")
    {
        require(_tours != address(0), "Invalid TOURS address");
        tours = IERC20(_tours);
    }

    /**
     * @notice Wrap TOURS to get vTOURS with voting power
     * @param amount Amount of TOURS to wrap
     */
    function wrap(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        tours.safeTransferFrom(msg.sender, address(this), amount);
        _mint(msg.sender, amount);
        emit Wrapped(msg.sender, amount);
    }

    /**
     * @notice Wrap TOURS and delegate in one transaction
     * @param amount Amount of TOURS to wrap
     * @param delegatee Address to delegate voting power to
     */
    function wrapAndDelegate(uint256 amount, address delegatee) external {
        require(amount > 0, "Amount must be > 0");
        tours.safeTransferFrom(msg.sender, address(this), amount);
        _mint(msg.sender, amount);
        _delegate(msg.sender, delegatee);
        emit Wrapped(msg.sender, amount);
    }

    /**
     * @notice Unwrap vTOURS to get TOURS back
     * @param amount Amount of vTOURS to unwrap
     */
    function unwrap(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        require(balanceOf(msg.sender) >= amount, "Insufficient vTOURS");
        _burn(msg.sender, amount);
        tours.safeTransfer(msg.sender, amount);
        emit Unwrapped(msg.sender, amount);
    }

    /**
     * @notice Get the underlying TOURS balance held by this contract
     */
    function totalToursBacking() external view returns (uint256) {
        return tours.balanceOf(address(this));
    }

    // ============================================
    // Required Overrides
    // ============================================

    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Votes)
    {
        super._update(from, to, value);
    }

    function nonces(address owner)
        public
        view
        override(ERC20Permit, Nonces)
        returns (uint256)
    {
        return super.nonces(owner);
    }
}
