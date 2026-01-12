// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title DAOReserve
 * @notice DAO-governed reserve fund for community-approved withdrawals
 * @dev Requires DAO proposal approval before any withdrawal
 *
 * Receives reserve portions from:
 * - MusicSubscriptionV2 (20% reserve)
 * - Future contracts with reserve allocations
 *
 * Withdrawal Process:
 * 1. DAO creates proposal to withdraw funds
 * 2. Community votes on proposal
 * 3. If passed, authorized executor calls executeWithdrawal
 */
contract DAOReserve is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============================================
    // State
    // ============================================

    IERC20 public immutable wmonToken;
    address public dao;                    // EmpowerToursDAO address
    address public executor;               // Authorized to execute approved withdrawals

    uint256 public totalDeposited;
    uint256 public totalWithdrawn;

    // Approved withdrawals (proposalId => approved amount)
    mapping(uint256 => uint256) public approvedWithdrawals;
    mapping(uint256 => bool) public withdrawalExecuted;
    mapping(uint256 => address) public withdrawalRecipient;

    // Deposit sources
    mapping(address => uint256) public depositsBySource;

    // ============================================
    // Events
    // ============================================

    event ReserveDeposited(address indexed from, uint256 amount);
    event WithdrawalApproved(uint256 indexed proposalId, address indexed recipient, uint256 amount);
    event WithdrawalExecuted(uint256 indexed proposalId, address indexed recipient, uint256 amount);
    event WithdrawalCancelled(uint256 indexed proposalId);
    event DAOUpdated(address indexed oldDAO, address indexed newDAO);
    event ExecutorUpdated(address indexed oldExecutor, address indexed newExecutor);
    event EmergencyWithdraw(address indexed token, address indexed to, uint256 amount);

    // ============================================
    // Modifiers
    // ============================================

    modifier onlyDAO() {
        require(msg.sender == dao, "Only DAO can call");
        _;
    }

    modifier onlyExecutor() {
        require(msg.sender == executor || msg.sender == dao, "Only executor or DAO");
        _;
    }

    // ============================================
    // Constructor
    // ============================================

    constructor(address _wmonToken, address _dao) Ownable(msg.sender) {
        require(_wmonToken != address(0), "Invalid WMON token");
        require(_dao != address(0), "Invalid DAO address");

        wmonToken = IERC20(_wmonToken);
        dao = _dao;
        executor = _dao; // Initially DAO is also executor
    }

    // ============================================
    // Deposit Functions
    // ============================================

    /**
     * @notice Deposit reserve funds
     * @param amount Amount of WMON to deposit
     */
    function deposit(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be > 0");

        wmonToken.safeTransferFrom(msg.sender, address(this), amount);

        depositsBySource[msg.sender] += amount;
        totalDeposited += amount;

        emit ReserveDeposited(msg.sender, amount);
    }

    /**
     * @notice Receive native MON
     */
    receive() external payable {}

    // ============================================
    // DAO Governance Functions
    // ============================================

    /**
     * @notice Approve a withdrawal (called by DAO after proposal passes)
     * @param proposalId The DAO proposal ID
     * @param recipient Where to send funds
     * @param amount Amount approved for withdrawal
     */
    function approveWithdrawal(
        uint256 proposalId,
        address recipient,
        uint256 amount
    ) external onlyDAO {
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be > 0");
        require(approvedWithdrawals[proposalId] == 0, "Already approved");

        approvedWithdrawals[proposalId] = amount;
        withdrawalRecipient[proposalId] = recipient;

        emit WithdrawalApproved(proposalId, recipient, amount);
    }

    /**
     * @notice Execute an approved withdrawal
     * @param proposalId The DAO proposal ID
     */
    function executeWithdrawal(uint256 proposalId) external onlyExecutor nonReentrant {
        uint256 amount = approvedWithdrawals[proposalId];
        address recipient = withdrawalRecipient[proposalId];

        require(amount > 0, "No approved withdrawal");
        require(!withdrawalExecuted[proposalId], "Already executed");
        require(wmonToken.balanceOf(address(this)) >= amount, "Insufficient balance");

        withdrawalExecuted[proposalId] = true;
        totalWithdrawn += amount;

        wmonToken.safeTransfer(recipient, amount);

        emit WithdrawalExecuted(proposalId, recipient, amount);
    }

    /**
     * @notice Cancel an approved withdrawal (before execution)
     * @param proposalId The DAO proposal ID
     */
    function cancelWithdrawal(uint256 proposalId) external onlyDAO {
        require(approvedWithdrawals[proposalId] > 0, "No approved withdrawal");
        require(!withdrawalExecuted[proposalId], "Already executed");

        delete approvedWithdrawals[proposalId];
        delete withdrawalRecipient[proposalId];

        emit WithdrawalCancelled(proposalId);
    }

    // ============================================
    // Admin Functions
    // ============================================

    /**
     * @notice Update DAO address (for upgrades)
     * @param newDAO New DAO contract address
     */
    function setDAO(address newDAO) external onlyOwner {
        require(newDAO != address(0), "Invalid DAO address");
        address oldDAO = dao;
        dao = newDAO;
        emit DAOUpdated(oldDAO, newDAO);
    }

    /**
     * @notice Update executor address
     * @param newExecutor New executor address
     */
    function setExecutor(address newExecutor) external onlyOwner {
        require(newExecutor != address(0), "Invalid executor");
        address oldExecutor = executor;
        executor = newExecutor;
        emit ExecutorUpdated(oldExecutor, newExecutor);
    }

    /**
     * @notice Emergency withdraw (owner only, for critical situations)
     * @dev Should only be used if DAO is compromised or non-functional
     * @param token Token to withdraw
     * @param to Recipient
     * @param amount Amount to withdraw
     */
    function emergencyWithdraw(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner nonReentrant {
        require(to != address(0), "Invalid recipient");
        IERC20(token).safeTransfer(to, amount);
        emit EmergencyWithdraw(token, to, amount);
    }

    /**
     * @notice Emergency withdraw native MON
     */
    function emergencyWithdrawNative(address payable to, uint256 amount) external onlyOwner nonReentrant {
        require(to != address(0), "Invalid recipient");
        uint256 balance = address(this).balance;
        uint256 withdrawAmount = amount == 0 ? balance : amount;
        require(withdrawAmount <= balance, "Insufficient balance");

        (bool success, ) = to.call{value: withdrawAmount}("");
        require(success, "Transfer failed");
    }

    // ============================================
    // View Functions
    // ============================================

    /**
     * @notice Get current WMON balance
     */
    function getBalance() external view returns (uint256) {
        return wmonToken.balanceOf(address(this));
    }

    /**
     * @notice Get reserve stats
     */
    function getStats() external view returns (
        uint256 currentBalance,
        uint256 totalDepositedAmount,
        uint256 totalWithdrawnAmount,
        uint256 availableBalance
    ) {
        uint256 balance = wmonToken.balanceOf(address(this));
        return (
            balance,
            totalDeposited,
            totalWithdrawn,
            balance
        );
    }

    /**
     * @notice Check if a withdrawal is pending execution
     */
    function getWithdrawalStatus(uint256 proposalId) external view returns (
        uint256 amount,
        address recipient,
        bool executed,
        bool pending
    ) {
        return (
            approvedWithdrawals[proposalId],
            withdrawalRecipient[proposalId],
            withdrawalExecuted[proposalId],
            approvedWithdrawals[proposalId] > 0 && !withdrawalExecuted[proposalId]
        );
    }

    /**
     * @notice Get deposits from a specific source contract
     */
    function getDepositsFrom(address source) external view returns (uint256) {
        return depositsBySource[source];
    }
}
