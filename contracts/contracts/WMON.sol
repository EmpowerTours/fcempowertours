// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title WMON - Wrapped MON
 * @notice Wraps native MON token into an ERC20 for use in AMM pools
 * @dev Similar to WETH - deposit MON to receive WMON, withdraw WMON to receive MON
 */
contract WMON is ERC20 {

    event Deposit(address indexed account, uint256 amount);
    event Withdrawal(address indexed account, uint256 amount);

    constructor() ERC20("Wrapped MON", "WMON") {}

    /**
     * @notice Deposit MON to receive WMON
     */
    function deposit() external payable {
        require(msg.value > 0, "Must deposit MON");
        _mint(msg.sender, msg.value);
        emit Deposit(msg.sender, msg.value);
    }

    /**
     * @notice Withdraw WMON to receive MON
     * @param amount Amount of WMON to withdraw
     */
    function withdraw(uint256 amount) external {
        require(balanceOf(msg.sender) >= amount, "Insufficient WMON balance");
        _burn(msg.sender, amount);
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "MON transfer failed");
        emit Withdrawal(msg.sender, amount);
    }

    /**
     * @notice Allow contract to receive MON
     */
    receive() external payable {
        _mint(msg.sender, msg.value);
        emit Deposit(msg.sender, msg.value);
    }
}
