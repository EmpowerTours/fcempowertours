// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title WMONUnwrapHelper
 * @notice Helper contract to unwrap WMON for Safe smart contract accounts.
 * @dev The official WMON contract uses `transfer()` which only forwards 2300 gas,
 *      which is not enough for Safe accounts to receive native currency.
 *      This helper receives the MON and forwards it using `call()` with full gas.
 *
 * Flow:
 * 1. Safe approves this helper for WMON spending
 * 2. Safe calls unwrapTo(amount, recipient)
 * 3. Helper transfers WMON from Safe, calls WMON.withdraw()
 * 4. Helper receives MON, forwards to recipient using call()
 */

interface IWMON {
    function withdraw(uint256 wad) external;
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract WMONUnwrapHelper {
    IWMON public immutable wmon;

    event Unwrapped(address indexed from, address indexed to, uint256 amount);
    event Debug(string message, uint256 value);

    constructor(address _wmon) {
        require(_wmon != address(0), "Invalid WMON address");
        wmon = IWMON(_wmon);
    }

    /**
     * @notice Unwrap WMON to MON and send to a recipient
     * @param amount Amount of WMON to unwrap
     * @param recipient Address to receive the MON (use msg.sender to send to yourself)
     * @dev Caller must approve this contract to spend their WMON first
     */
    function unwrapTo(uint256 amount, address recipient) external {
        require(amount > 0, "Amount must be > 0");
        require(recipient != address(0), "Invalid recipient");

        // Transfer WMON from caller to this contract
        bool success = wmon.transferFrom(msg.sender, address(this), amount);
        require(success, "WMON transfer failed");

        // Withdraw (convert WMON to MON) - MON will be sent here via transfer()
        wmon.withdraw(amount);

        // Forward MON to recipient using call() with full gas
        (bool sent, ) = payable(recipient).call{value: amount}("");
        require(sent, "MON transfer failed");

        emit Unwrapped(msg.sender, recipient, amount);
    }

    /**
     * @notice Unwrap WMON to MON and send to msg.sender
     * @param amount Amount of WMON to unwrap
     */
    function unwrap(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");

        // Transfer WMON from caller to this contract
        bool success = wmon.transferFrom(msg.sender, address(this), amount);
        require(success, "WMON transfer failed");

        // Withdraw (convert WMON to MON)
        wmon.withdraw(amount);

        // Forward MON to caller using call() with full gas
        (bool sent, ) = payable(msg.sender).call{value: amount}("");
        require(sent, "MON transfer failed");

        emit Unwrapped(msg.sender, msg.sender, amount);
    }

    // Receive MON from WMON.withdraw()
    receive() external payable {}

    // Fallback for any unexpected calls
    fallback() external payable {}
}
