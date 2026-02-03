// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title ToursRewardManager
 * @notice Manages TOURS token reward rates with Bitcoin-style halving
 * @author EmpowerTours
 *
 * @dev Replaces hardcoded reward constants across all EmpowerTours contracts.
 *      All contracts that distribute TOURS should call this manager to get
 *      current reward rates instead of using constants.
 *
 * === HALVING SCHEDULE ===
 * Epoch 0 (launch):     base rates (e.g., 0.1 TOURS per song listen)
 * Epoch 1 (1 year):     base / 2
 * Epoch 2 (2 years):    base / 4
 * Epoch 3 (3 years):    base / 8
 * ...continues halving every epoch
 *
 * === ACTIVITY-BASED ADJUSTMENT ===
 * If daily distribution exceeds a configurable threshold,
 * the DAO can vote to trigger early halving or adjust rates.
 *
 * === REWARD TYPES ===
 * - LISTEN:        Listening to a song on Live Radio
 * - VOICE_NOTE:    Voice note gets played on Live Radio
 * - FIRST_LISTEN:  First listener of the day bonus
 * - STREAK_7:      7-day listening streak bonus
 * - ITINERARY:     Completing a travel itinerary
 * - TOUR_GUIDE:    Completing a tour as a guide
 * - QUEST:         Generic quest/activity reward
 * - ARTIST_MONTHLY: Monthly artist eligibility reward (MusicSubscription)
 * - CLIMB_JOURNAL:  Climbing journal entry reward (base rate, uses random 1-10x multiplier)
 * - LOTTERY_WINNER: Daily lottery winner bonus (base rate, random 1-10x multiplier)
 * - LOTTERY_TRIGGER: Reward for triggering lottery draw (base rate, random 1-10x multiplier)
 */
contract ToursRewardManager is Ownable {
    using SafeERC20 for IERC20;

    // ============================================
    // Enums
    // ============================================
    enum RewardType {
        LISTEN,
        VOICE_NOTE,
        FIRST_LISTEN,
        STREAK_7,
        ITINERARY_COMPLETE,
        TOUR_GUIDE_COMPLETE,
        QUEST,
        ARTIST_MONTHLY,
        CLIMB_JOURNAL
    }

    // ============================================
    // State
    // ============================================
    IERC20 public toursToken;
    address public daoTimelock;

    // Halving configuration
    uint256 public deployedAt;
    uint256 public halvingInterval;       // seconds between halvings (default: 365 days)
    uint256 public currentEpoch;
    uint256 public maxEpochs;             // stop halving after this many epochs (e.g., 20)
    uint256 public minRewardFloor;        // minimum reward amount (prevents going to dust)

    // Base reward rates (set at deployment, represent epoch 0 rates)
    mapping(RewardType => uint256) public baseRewards;

    // Manual rate overrides (DAO can set specific rates)
    mapping(RewardType => uint256) public overrideRewards;
    mapping(RewardType => bool) public hasOverride;

    // Authorized distributors (contracts that can request reward calculations)
    mapping(address => bool) public authorizedDistributors;

    // Tracking
    uint256 public totalDistributed;
    uint256 public dailyDistributed;
    uint256 public lastResetDay;
    uint256 public dailyDistributionCap;  // DAO-configurable daily cap

    // Emergency
    bool public paused;

    // ============================================
    // Events
    // ============================================
    event HalvingTriggered(uint256 indexed epoch, uint256 timestamp);
    event BaseRewardUpdated(RewardType indexed rewardType, uint256 oldRate, uint256 newRate);
    event OverrideSet(RewardType indexed rewardType, uint256 rate);
    event OverrideCleared(RewardType indexed rewardType);
    event DistributorUpdated(address indexed distributor, bool authorized);
    event DailyCapUpdated(uint256 oldCap, uint256 newCap);
    event DAOTimelockUpdated(address indexed oldTimelock, address indexed newTimelock);
    event RewardDistributed(address indexed recipient, RewardType indexed rewardType, uint256 amount);
    event EarlyHalvingTriggered(uint256 indexed newEpoch, address triggeredBy);

    // ============================================
    // Modifiers
    // ============================================
    modifier whenNotPaused() {
        require(!paused, "Paused");
        _;
    }

    modifier onlyOwnerOrDAO() {
        require(msg.sender == owner() || msg.sender == daoTimelock, "Only owner or DAO");
        _;
    }

    modifier onlyDistributor() {
        require(authorizedDistributors[msg.sender], "Not authorized distributor");
        _;
    }

    // ============================================
    // Constructor
    // ============================================
    constructor(
        address _toursToken,
        uint256 _halvingInterval,
        uint256 _maxEpochs,
        uint256 _minRewardFloor,
        uint256 _dailyCap
    ) Ownable(msg.sender) {
        require(_toursToken != address(0), "Invalid TOURS token");
        require(_halvingInterval > 0, "Invalid halving interval");

        toursToken = IERC20(_toursToken);
        halvingInterval = _halvingInterval;
        maxEpochs = _maxEpochs;
        minRewardFloor = _minRewardFloor;
        dailyDistributionCap = _dailyCap;
        deployedAt = block.timestamp;
        lastResetDay = block.timestamp / 86400;

        // Set default base rewards (epoch 0 rates)
        baseRewards[RewardType.LISTEN]                = 0.1 ether;    // 0.1 TOURS per song
        baseRewards[RewardType.VOICE_NOTE]            = 1 ether;      // 1 TOURS per voice note played
        baseRewards[RewardType.FIRST_LISTEN]          = 5 ether;      // 5 TOURS first listener bonus
        baseRewards[RewardType.STREAK_7]              = 10 ether;     // 10 TOURS 7-day streak
        baseRewards[RewardType.ITINERARY_COMPLETE]    = 50 ether;     // 50 TOURS itinerary completion
        baseRewards[RewardType.TOUR_GUIDE_COMPLETE]   = 25 ether;     // 25 TOURS guide completion
        baseRewards[RewardType.QUEST]                 = 5 ether;      // 5 TOURS generic quest
        baseRewards[RewardType.ARTIST_MONTHLY]        = 1 ether;      // 1 TOURS monthly artist eligibility reward
        baseRewards[RewardType.CLIMB_JOURNAL]         = 1 ether;      // 1 TOURS base (with random 1-10x multiplier)
    }

    // ============================================
    // Core: Get Current Reward Amount
    // ============================================

    /**
     * @notice Get the current reward amount for a given reward type
     * @dev Applies halving based on time elapsed since deployment
     * @param rewardType The type of reward to calculate
     * @return amount The current reward amount in TOURS (18 decimals)
     */
    function getCurrentReward(RewardType rewardType) public view returns (uint256) {
        // Check for manual override first
        if (hasOverride[rewardType]) {
            return overrideRewards[rewardType];
        }

        uint256 base = baseRewards[rewardType];
        if (base == 0) return 0;

        // Calculate current epoch based on time
        uint256 epoch = _currentEpoch();

        // Apply halving: base / 2^epoch
        if (epoch >= maxEpochs) {
            // After max epochs, return floor
            return minRewardFloor;
        }

        uint256 halved = base >> epoch; // right-shift = divide by 2^epoch

        // Enforce minimum floor
        if (halved < minRewardFloor) {
            return minRewardFloor;
        }

        return halved;
    }

    /**
     * @notice Calculate current epoch based on elapsed time
     */
    function _currentEpoch() internal view returns (uint256) {
        uint256 elapsed = block.timestamp - deployedAt;
        return elapsed / halvingInterval;
    }

    /**
     * @notice Get current epoch (public view)
     */
    function getCurrentEpoch() external view returns (uint256) {
        return _currentEpoch();
    }

    // ============================================
    // Distribute Rewards
    // ============================================

    /**
     * @notice Distribute TOURS rewards to a recipient
     * @dev Only callable by authorized distributor contracts
     * @param recipient The address to receive rewards
     * @param rewardType The type of activity being rewarded
     * @return amount The amount of TOURS distributed
     */
    function distributeReward(
        address recipient,
        RewardType rewardType
    ) external onlyDistributor whenNotPaused returns (uint256) {
        require(recipient != address(0), "Invalid recipient");

        // Reset daily counter if new day
        uint256 today = block.timestamp / 86400;
        if (today > lastResetDay) {
            dailyDistributed = 0;
            lastResetDay = today;
        }

        uint256 amount = getCurrentReward(rewardType);
        if (amount == 0) return 0;

        // Check daily cap
        if (dailyDistributionCap > 0) {
            require(
                dailyDistributed + amount <= dailyDistributionCap,
                "Daily distribution cap reached"
            );
        }

        // Check balance
        uint256 balance = toursToken.balanceOf(address(this));
        require(balance >= amount, "Insufficient TOURS balance");

        // Distribute
        dailyDistributed += amount;
        totalDistributed += amount;
        toursToken.safeTransfer(recipient, amount);

        emit RewardDistributed(recipient, rewardType, amount);
        return amount;
    }

    /**
     * @notice Distribute a custom amount (for variable rewards like speed bonuses)
     * @param recipient The address to receive rewards
     * @param rewardType The type of activity
     * @param multiplierBps Multiplier in basis points (10000 = 1x, 15000 = 1.5x)
     */
    function distributeRewardWithMultiplier(
        address recipient,
        RewardType rewardType,
        uint256 multiplierBps
    ) external onlyDistributor whenNotPaused returns (uint256) {
        require(recipient != address(0), "Invalid recipient");
        require(multiplierBps > 0 && multiplierBps <= 50000, "Invalid multiplier"); // max 5x

        uint256 today = block.timestamp / 86400;
        if (today > lastResetDay) {
            dailyDistributed = 0;
            lastResetDay = today;
        }

        uint256 baseAmount = getCurrentReward(rewardType);
        uint256 amount = (baseAmount * multiplierBps) / 10000;

        if (amount == 0) return 0;

        if (dailyDistributionCap > 0) {
            require(
                dailyDistributed + amount <= dailyDistributionCap,
                "Daily distribution cap reached"
            );
        }

        uint256 balance = toursToken.balanceOf(address(this));
        require(balance >= amount, "Insufficient TOURS balance");

        dailyDistributed += amount;
        totalDistributed += amount;
        toursToken.safeTransfer(recipient, amount);

        emit RewardDistributed(recipient, rewardType, amount);
        return amount;
    }

    // ============================================
    // DAO Governance Functions
    // ============================================

    /**
     * @notice Set base reward rate for a reward type
     */
    function setBaseReward(RewardType rewardType, uint256 newRate) external onlyOwnerOrDAO {
        uint256 oldRate = baseRewards[rewardType];
        baseRewards[rewardType] = newRate;
        emit BaseRewardUpdated(rewardType, oldRate, newRate);
    }

    /**
     * @notice Set a manual override for a specific reward type
     */
    function setOverride(RewardType rewardType, uint256 rate) external onlyOwnerOrDAO {
        overrideRewards[rewardType] = rate;
        hasOverride[rewardType] = true;
        emit OverrideSet(rewardType, rate);
    }

    /**
     * @notice Clear a manual override (revert to halving schedule)
     */
    function clearOverride(RewardType rewardType) external onlyOwnerOrDAO {
        hasOverride[rewardType] = false;
        overrideRewards[rewardType] = 0;
        emit OverrideCleared(rewardType);
    }

    /**
     * @notice Update halving interval
     */
    function setHalvingInterval(uint256 newInterval) external onlyOwnerOrDAO {
        require(newInterval > 0, "Invalid interval");
        halvingInterval = newInterval;
    }

    /**
     * @notice Update daily distribution cap
     */
    function setDailyCap(uint256 newCap) external onlyOwnerOrDAO {
        uint256 oldCap = dailyDistributionCap;
        dailyDistributionCap = newCap;
    }

    /**
     * @notice Update minimum reward floor
     */
    function setMinRewardFloor(uint256 newFloor) external onlyOwnerOrDAO {
        minRewardFloor = newFloor;
    }

    /**
     * @notice Set DAO timelock address
     */
    function setDAOTimelock(address _daoTimelock) external onlyOwner {
        address old = daoTimelock;
        daoTimelock = _daoTimelock;
        emit DAOTimelockUpdated(old, _daoTimelock);
    }

    // ============================================
    // Distributor Management
    // ============================================

    function setDistributor(address distributor, bool authorized) external onlyOwnerOrDAO {
        authorizedDistributors[distributor] = authorized;
        emit DistributorUpdated(distributor, authorized);
    }

    // ============================================
    // Emergency
    // ============================================

    function pause() external onlyOwnerOrDAO {
        paused = true;
    }

    function unpause() external onlyOwnerOrDAO {
        paused = false;
    }

    function emergencyWithdraw() external onlyOwner {
        uint256 balance = toursToken.balanceOf(address(this));
        if (balance > 0) {
            toursToken.safeTransfer(owner(), balance);
        }
    }

    /**
     * @notice Fund the reward pool
     */
    function fundRewards(uint256 amount) external {
        toursToken.safeTransferFrom(msg.sender, address(this), amount);
    }

    // ============================================
    // View Functions
    // ============================================

    /**
     * @notice Get all current reward rates
     */
    function getAllCurrentRewards() external view returns (
        uint256 listen,
        uint256 voiceNote,
        uint256 firstListen,
        uint256 streak7,
        uint256 itineraryComplete,
        uint256 tourGuideComplete,
        uint256 quest,
        uint256 artistMonthly,
        uint256 climbJournal
    ) {
        return (
            getCurrentReward(RewardType.LISTEN),
            getCurrentReward(RewardType.VOICE_NOTE),
            getCurrentReward(RewardType.FIRST_LISTEN),
            getCurrentReward(RewardType.STREAK_7),
            getCurrentReward(RewardType.ITINERARY_COMPLETE),
            getCurrentReward(RewardType.TOUR_GUIDE_COMPLETE),
            getCurrentReward(RewardType.QUEST),
            getCurrentReward(RewardType.ARTIST_MONTHLY),
            getCurrentReward(RewardType.CLIMB_JOURNAL)
        );
    }

    /**
     * @notice Get reward pool balance
     */
    function getRewardPoolBalance() external view returns (uint256) {
        return toursToken.balanceOf(address(this));
    }

    /**
     * @notice Get daily distribution stats
     */
    function getDailyStats() external view returns (
        uint256 distributed,
        uint256 cap,
        uint256 remaining
    ) {
        uint256 today = block.timestamp / 86400;
        uint256 todayDistributed = (today > lastResetDay) ? 0 : dailyDistributed;
        uint256 rem = (dailyDistributionCap > todayDistributed)
            ? dailyDistributionCap - todayDistributed
            : 0;
        return (todayDistributed, dailyDistributionCap, rem);
    }

    /**
     * @notice Project when next halving occurs
     */
    function getNextHalvingTimestamp() external view returns (uint256) {
        uint256 epoch = _currentEpoch();
        if (epoch >= maxEpochs) return 0; // no more halvings
        return deployedAt + ((epoch + 1) * halvingInterval);
    }

    /**
     * @notice Preview reward rates at a future epoch
     */
    function previewRewardsAtEpoch(uint256 epoch) external view returns (
        uint256 listen,
        uint256 voiceNote,
        uint256 firstListen,
        uint256 streak7
    ) {
        uint256 e = epoch >= maxEpochs ? maxEpochs : epoch;

        uint256 l = baseRewards[RewardType.LISTEN] >> e;
        uint256 v = baseRewards[RewardType.VOICE_NOTE] >> e;
        uint256 f = baseRewards[RewardType.FIRST_LISTEN] >> e;
        uint256 s = baseRewards[RewardType.STREAK_7] >> e;

        return (
            l < minRewardFloor ? minRewardFloor : l,
            v < minRewardFloor ? minRewardFloor : v,
            f < minRewardFloor ? minRewardFloor : f,
            s < minRewardFloor ? minRewardFloor : s
        );
    }
}
