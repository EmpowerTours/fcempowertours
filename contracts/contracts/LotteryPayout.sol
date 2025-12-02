// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title LotteryPayout
 * @notice Daily lottery contract on Base - auto-splits entry fees
 * @dev 50% Prize Pool / 50% Platform
 */
contract LotteryPayout {
    address public owner;
    address public platformWallet;

    // Fund allocation (50/50 split)
    uint256 public constant PRIZE_POOL_BPS = 5000;    // 50% to prize pool
    uint256 public constant PLATFORM_BPS = 5000;      // 50% to platform

    // Tracked balances
    uint256 public prizePool;
    uint256 public platformBalance;

    // Entry fee: 0.002 ETH
    uint256 public entryFee = 0.002 ether;

    // Events
    event EntryReceived(address indexed user, uint256 amount, string lotteryDay);
    event Payout(address indexed winner, uint256 amount, string lotteryDay);
    event PlatformWithdraw(address indexed to, uint256 amount);
    event EntryFeeUpdated(uint256 oldFee, uint256 newFee);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _platformWallet) {
        require(_platformWallet != address(0), "Invalid platform wallet");
        owner = msg.sender;
        platformWallet = _platformWallet;
    }

    /**
     * @notice Enter the lottery
     * @param lotteryDay The day identifier (e.g., "2025-01-15")
     */
    function enter(string calldata lotteryDay) external payable {
        require(msg.value >= entryFee, "Insufficient entry fee");
        _splitFunds(msg.value, lotteryDay);
    }

    /**
     * @notice Direct send - also enters lottery
     */
    receive() external payable {
        require(msg.value >= entryFee, "Insufficient entry fee");
        _splitFunds(msg.value, "direct");
    }

    function _splitFunds(uint256 amount, string memory lotteryDay) internal {
        uint256 toPrize = (amount * PRIZE_POOL_BPS) / 10000;
        uint256 toPlatform = amount - toPrize;

        prizePool += toPrize;
        platformBalance += toPlatform;

        emit EntryReceived(msg.sender, amount, lotteryDay);
    }

    /**
     * @notice Send payout to lottery winner (owner only)
     */
    function payout(
        address payable winner,
        uint256 amount,
        string calldata lotteryDay
    ) external onlyOwner {
        require(winner != address(0), "Invalid winner");
        require(amount > 0, "Amount must be > 0");
        require(amount <= prizePool, "Exceeds prize pool");

        prizePool -= amount;

        (bool success, ) = winner.call{value: amount}("");
        require(success, "Transfer failed");

        emit Payout(winner, amount, lotteryDay);
    }

    /**
     * @notice Withdraw platform earnings
     */
    function withdrawPlatform() external onlyOwner {
        uint256 amount = platformBalance;
        require(amount > 0, "No platform balance");

        platformBalance = 0;

        (bool success, ) = payable(platformWallet).call{value: amount}("");
        require(success, "Withdraw failed");

        emit PlatformWithdraw(platformWallet, amount);
    }

    /**
     * @notice Get all balances
     */
    function getBalances() external view returns (
        uint256 _prizePool,
        uint256 _platformBalance,
        uint256 _totalBalance
    ) {
        return (prizePool, platformBalance, address(this).balance);
    }

    /**
     * @notice Update entry fee
     */
    function setEntryFee(uint256 newFee) external onlyOwner {
        require(newFee > 0, "Fee must be > 0");
        emit EntryFeeUpdated(entryFee, newFee);
        entryFee = newFee;
    }

    /**
     * @notice Update platform wallet
     */
    function setPlatformWallet(address newWallet) external onlyOwner {
        require(newWallet != address(0), "Invalid address");
        platformWallet = newWallet;
    }

    /**
     * @notice Transfer ownership
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /**
     * @notice Emergency withdraw (owner only)
     */
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No balance");

        prizePool = 0;
        platformBalance = 0;

        (bool success, ) = payable(owner).call{value: balance}("");
        require(success, "Withdraw failed");
    }
}
