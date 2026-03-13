// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ListenerRewardPool
 * @notice Distributes WMON from the 20% DAO reserve to active radio listeners
 * @author EmpowerTours
 *
 * Flow:
 * 1. MusicSubscriptionV5 accumulates 20% of subscription revenue as DAO reserve
 * 2. Owner calls withdrawReserveToDAO(thisContract) on MusicSubscriptionV5
 * 3. Owner finalizes a month with listener allocations (from off-chain radio stats)
 * 4. Listeners claim their proportional WMON share
 *
 * Allocation is based on verified listen counts tracked by the Live Radio API.
 * Anti-gaming: only heartbeat-verified listens count, same anti-spam rules as PlayOracleV3.
 */
contract ListenerRewardPool is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable wmonToken;

    // ============================================
    // Monthly Distribution State
    // ============================================

    struct MonthlyPool {
        uint256 totalWMON;           // Total WMON allocated this month
        uint256 totalListenPoints;   // Sum of all listener points (songs listened)
        uint256 listenerCount;       // Number of listeners with allocations
        bool finalized;              // Whether allocations are locked
        bool funded;                 // Whether WMON has been deposited
    }

    mapping(uint256 => MonthlyPool) public monthlyPools;

    // monthId => listener => listen points
    mapping(uint256 => mapping(address => uint256)) public listenerPoints;

    // monthId => listener => claimed
    mapping(uint256 => mapping(address => bool)) public listenerClaimed;

    // Track total unclaimed WMON held for distributions
    uint256 public totalReservedForClaims;

    // ============================================
    // Events
    // ============================================

    event MonthFunded(uint256 indexed monthId, uint256 amount);
    event MonthFinalized(uint256 indexed monthId, uint256 totalWMON, uint256 totalListenPoints, uint256 listenerCount);
    event ListenerAllocated(uint256 indexed monthId, address indexed listener, uint256 points);
    event ListenerClaimed(uint256 indexed monthId, address indexed listener, uint256 amount);
    event BatchAllocated(uint256 indexed monthId, uint256 count, uint256 totalPoints);
    event ExcessWithdrawn(address indexed to, uint256 amount);

    // ============================================
    // Constructor
    // ============================================

    constructor(address _wmonToken) Ownable(msg.sender) {
        require(_wmonToken != address(0), "Invalid WMON");
        wmonToken = IERC20(_wmonToken);
    }

    // ============================================
    // Fund a Monthly Pool
    // ============================================

    /**
     * @notice Deposit WMON into a monthly pool (from DAO reserve withdrawal)
     * @param monthId The month identifier (block.timestamp / 30 days)
     * @param amount WMON amount to deposit
     */
    function fundMonth(uint256 monthId, uint256 amount) external onlyOwner {
        require(amount > 0, "Zero amount");
        require(!monthlyPools[monthId].finalized, "Already finalized");

        wmonToken.safeTransferFrom(msg.sender, address(this), amount);

        monthlyPools[monthId].totalWMON += amount;
        monthlyPools[monthId].funded = true;
        totalReservedForClaims += amount;

        emit MonthFunded(monthId, amount);
    }

    // ============================================
    // Set Listener Allocations
    // ============================================

    /**
     * @notice Batch-set listener points for a month (from off-chain radio stats)
     * @dev Can be called multiple times before finalization for large listener sets
     * @param monthId The month identifier
     * @param listeners Array of listener addresses
     * @param points Array of listen points (songs listened that month)
     */
    function batchSetListenerPoints(
        uint256 monthId,
        address[] calldata listeners,
        uint256[] calldata points
    ) external onlyOwner {
        require(listeners.length == points.length, "Length mismatch");
        require(!monthlyPools[monthId].finalized, "Already finalized");

        MonthlyPool storage pool = monthlyPools[monthId];
        uint256 totalNewPoints = 0;

        for (uint256 i = 0; i < listeners.length; i++) {
            require(listeners[i] != address(0), "Zero address");
            require(points[i] > 0, "Zero points");

            // If listener already has points, subtract old from total before adding new
            uint256 oldPoints = listenerPoints[monthId][listeners[i]];
            if (oldPoints > 0) {
                pool.totalListenPoints -= oldPoints;
            } else {
                pool.listenerCount++;
            }

            listenerPoints[monthId][listeners[i]] = points[i];
            pool.totalListenPoints += points[i];
            totalNewPoints += points[i];

            emit ListenerAllocated(monthId, listeners[i], points[i]);
        }

        emit BatchAllocated(monthId, listeners.length, totalNewPoints);
    }

    /**
     * @notice Finalize a month's allocations — no more changes allowed
     * @param monthId The month identifier
     */
    function finalizeMonth(uint256 monthId) external onlyOwner {
        MonthlyPool storage pool = monthlyPools[monthId];
        require(pool.funded, "Not funded");
        require(pool.totalListenPoints > 0, "No listeners");
        require(!pool.finalized, "Already finalized");

        pool.finalized = true;

        emit MonthFinalized(monthId, pool.totalWMON, pool.totalListenPoints, pool.listenerCount);
    }

    // ============================================
    // Listener Claims
    // ============================================

    /**
     * @notice Claim WMON reward for a finalized month
     * @param monthId The month to claim for
     */
    function claimReward(uint256 monthId) external nonReentrant {
        MonthlyPool storage pool = monthlyPools[monthId];
        require(pool.finalized, "Month not finalized");
        require(!listenerClaimed[monthId][msg.sender], "Already claimed");

        uint256 points = listenerPoints[monthId][msg.sender];
        require(points > 0, "No allocation");

        uint256 payout = (points * pool.totalWMON) / pool.totalListenPoints;
        require(payout > 0, "Payout too small");

        listenerClaimed[monthId][msg.sender] = true;
        totalReservedForClaims -= payout;

        wmonToken.safeTransfer(msg.sender, payout);

        emit ListenerClaimed(monthId, msg.sender, payout);
    }

    /**
     * @notice Batch claim WMON rewards across multiple months
     * @param monthIds Array of month IDs to claim
     */
    function batchClaimRewards(uint256[] calldata monthIds) external nonReentrant {
        uint256 totalPayout = 0;

        for (uint256 i = 0; i < monthIds.length; i++) {
            uint256 monthId = monthIds[i];
            MonthlyPool storage pool = monthlyPools[monthId];

            if (!pool.finalized) continue;
            if (listenerClaimed[monthId][msg.sender]) continue;

            uint256 points = listenerPoints[monthId][msg.sender];
            if (points == 0) continue;

            uint256 payout = (points * pool.totalWMON) / pool.totalListenPoints;
            if (payout == 0) continue;

            listenerClaimed[monthId][msg.sender] = true;
            totalPayout += payout;

            emit ListenerClaimed(monthId, msg.sender, payout);
        }

        require(totalPayout > 0, "No rewards to claim");
        totalReservedForClaims -= totalPayout;

        wmonToken.safeTransfer(msg.sender, totalPayout);
    }

    // ============================================
    // View Functions
    // ============================================

    /**
     * @notice Get a listener's pending reward for a specific month
     */
    function getListenerReward(uint256 monthId, address listener) external view returns (
        uint256 points,
        uint256 estimatedPayout,
        bool claimed
    ) {
        MonthlyPool memory pool = monthlyPools[monthId];
        points = listenerPoints[monthId][listener];
        claimed = listenerClaimed[monthId][listener];

        if (pool.totalListenPoints > 0 && points > 0) {
            estimatedPayout = (points * pool.totalWMON) / pool.totalListenPoints;
        }
    }

    /**
     * @notice Get monthly pool info
     */
    function getMonthlyPool(uint256 monthId) external view returns (
        uint256 totalWMON,
        uint256 totalListenPoints,
        uint256 listenerCount,
        bool finalized,
        bool funded
    ) {
        MonthlyPool memory pool = monthlyPools[monthId];
        return (pool.totalWMON, pool.totalListenPoints, pool.listenerCount, pool.finalized, pool.funded);
    }

    /**
     * @notice Get current month ID (same formula as MusicSubscriptionV5)
     */
    function getCurrentMonthId() external view returns (uint256) {
        return block.timestamp / 30 days;
    }

    // ============================================
    // Admin
    // ============================================

    /**
     * @notice Withdraw excess WMON not reserved for claims (e.g., rounding dust)
     */
    function withdrawExcess(address to) external onlyOwner {
        require(to != address(0), "Zero address");
        uint256 balance = wmonToken.balanceOf(address(this));
        uint256 excess = balance - totalReservedForClaims;
        require(excess > 0, "No excess");

        wmonToken.safeTransfer(to, excess);

        emit ExcessWithdrawn(to, excess);
    }

    /**
     * @notice Emergency withdraw (only if needed)
     */
    function emergencyWithdraw(address to) external onlyOwner {
        require(to != address(0), "Zero address");
        uint256 balance = wmonToken.balanceOf(address(this));
        require(balance > 0, "No balance");

        totalReservedForClaims = 0;
        wmonToken.safeTransfer(to, balance);
    }
}
