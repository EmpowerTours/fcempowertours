// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title EmpowerToursTreasury
 * @notice Secure treasury contract for EmpowerTours platform
 * @dev Receives payments from Oracle queries (Maps, AI), NFT sales, and subscriptions
 */
contract EmpowerToursTreasury is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Events
    event Deposit(address indexed token, address indexed from, uint256 amount, string reason);
    event Withdrawal(address indexed token, address indexed to, uint256 amount);
    event NativeDeposit(address indexed from, uint256 amount);
    event NativeWithdrawal(address indexed to, uint256 amount);
    event OperatorUpdated(address indexed operator, bool status);

    // State
    mapping(address => bool) public operators;

    // Track deposits by category
    mapping(string => uint256) public categoryTotals;

    // Deposit categories
    string public constant CATEGORY_MAPS = "maps_query";
    string public constant CATEGORY_SUBSCRIPTION = "music_subscription";
    string public constant CATEGORY_NFT_SALE = "nft_sale";
    string public constant CATEGORY_OTHER = "other";

    modifier onlyOperator() {
        require(operators[msg.sender] || msg.sender == owner(), "Not authorized");
        _;
    }

    constructor(address initialOwner) Ownable(initialOwner) {
        operators[initialOwner] = true;
    }

    /**
     * @notice Receive native MON tokens
     */
    receive() external payable {
        emit NativeDeposit(msg.sender, msg.value);
    }

    /**
     * @notice Deposit ERC20 tokens with category tracking
     * @param token The token address
     * @param amount The amount to deposit
     * @param category The category for tracking (maps_query, music_subscription, etc.)
     */
    function depositToken(
        address token,
        uint256 amount,
        string calldata category
    ) external nonReentrant {
        require(amount > 0, "Amount must be > 0");

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        categoryTotals[category] += amount;

        emit Deposit(token, msg.sender, amount, category);
    }

    /**
     * @notice Operator can deposit on behalf of users (for delegation pattern)
     * @param token The token address
     * @param from The original depositor
     * @param amount The amount to deposit
     * @param category The category for tracking
     */
    function depositTokenFrom(
        address token,
        address from,
        uint256 amount,
        string calldata category
    ) external onlyOperator nonReentrant {
        require(amount > 0, "Amount must be > 0");

        IERC20(token).safeTransferFrom(from, address(this), amount);
        categoryTotals[category] += amount;

        emit Deposit(token, from, amount, category);
    }

    /**
     * @notice Withdraw ERC20 tokens (owner only)
     * @param token The token address
     * @param to The recipient
     * @param amount The amount to withdraw
     */
    function withdrawToken(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner nonReentrant {
        require(to != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be > 0");

        IERC20(token).safeTransfer(to, amount);

        emit Withdrawal(token, to, amount);
    }

    /**
     * @notice Withdraw native MON tokens (owner only)
     * @param to The recipient
     * @param amount The amount to withdraw
     */
    function withdrawNative(
        address payable to,
        uint256 amount
    ) external onlyOwner nonReentrant {
        require(to != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be > 0");
        require(address(this).balance >= amount, "Insufficient balance");

        (bool success, ) = to.call{value: amount}("");
        require(success, "Transfer failed");

        emit NativeWithdrawal(to, amount);
    }

    /**
     * @notice Set operator status
     * @param operator The operator address
     * @param status True to enable, false to disable
     */
    function setOperator(address operator, bool status) external onlyOwner {
        operators[operator] = status;
        emit OperatorUpdated(operator, status);
    }

    /**
     * @notice Get token balance
     * @param token The token address
     */
    function getTokenBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    /**
     * @notice Get native balance
     */
    function getNativeBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @notice Get total deposits by category
     * @param category The category name
     */
    function getCategoryTotal(string calldata category) external view returns (uint256) {
        return categoryTotals[category];
    }
}
