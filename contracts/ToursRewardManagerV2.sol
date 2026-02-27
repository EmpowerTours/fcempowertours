// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title ToursRewardManagerV2
 * @notice Manages TOURS token reward rates with Bitcoin-style halving
 * @author EmpowerTours
 *
 * @dev V2 Changes from V1:
 * - Added VENUE_OPERATOR reward type for venue music mining
 * - Venues earn TOURS per song played (with combo multiplier)
 * - Updated getAllCurrentRewards to include venueOperator
 *
 * === REWARD TYPES ===
 * - LISTEN:          Listening to a song on Live Radio
 * - VOICE_NOTE:      Voice note gets played on Live Radio
 * - FIRST_LISTEN:    First listener of the day bonus
 * - STREAK_7:        7-day listening streak bonus
 * - ITINERARY:       Completing a travel itinerary
 * - TOUR_GUIDE:      Completing a tour as a guide
 * - QUEST:           Generic quest/activity reward
 * - ARTIST_MONTHLY:  Monthly artist eligibility reward (MusicSubscription)
 * - CLIMB_JOURNAL:   Climbing journal entry reward
 * - VENUE_OPERATOR:  Venue music mining — TOURS per song hosted (with combo multiplier)
 */
contract ToursRewardManagerV2 is Ownable {
    using SafeERC20 for IERC20;

    // ============================================
    // Enums
    // ============================================
    enum RewardType {
        LISTEN,                // 0
        VOICE_NOTE,            // 1
        FIRST_LISTEN,          // 2
        STREAK_7,              // 3
        ITINERARY_COMPLETE,    // 4
        TOUR_GUIDE_COMPLETE,   // 5
        QUEST,                 // 6
        ARTIST_MONTHLY,        // 7
        CLIMB_JOURNAL,         // 8
        VENUE_OPERATOR         // 9 — NEW in V2
    }

    // ============================================
    // State
    // ============================================
    IERC20 public toursToken;
    address public daoTimelock;

    // Halving configuration
    uint256 public deployedAt;
    uint256 public halvingInterval;
    uint256 public currentEpoch;
    uint256 public maxEpochs;
    uint256 public minRewardFloor;

    // Base reward rates (epoch 0)
    mapping(RewardType => uint256) public baseRewards;

    // Manual rate overrides
    mapping(RewardType => uint256) public overrideRewards;
    mapping(RewardType => bool) public hasOverride;

    // Authorized distributors
    mapping(address => bool) public authorizedDistributors;

    // Tracking
    uint256 public totalDistributed;
    uint256 public dailyDistributed;
    uint256 public lastResetDay;
    uint256 public dailyDistributionCap;

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

        // Set default base rewards (epoch 0 rates) — same as V1
        baseRewards[RewardType.LISTEN]                = 0.1 ether;
        baseRewards[RewardType.VOICE_NOTE]            = 1 ether;
        baseRewards[RewardType.FIRST_LISTEN]          = 5 ether;
        baseRewards[RewardType.STREAK_7]              = 10 ether;
        baseRewards[RewardType.ITINERARY_COMPLETE]    = 50 ether;
        baseRewards[RewardType.TOUR_GUIDE_COMPLETE]   = 25 ether;
        baseRewards[RewardType.QUEST]                 = 5 ether;
        baseRewards[RewardType.ARTIST_MONTHLY]        = 1 ether;
        baseRewards[RewardType.CLIMB_JOURNAL]         = 1 ether;

        // V2: Venue operator mining reward
        // 0.05 TOURS per song hosted — venues use combo multiplier (up to 3x)
        // At 50 songs/day with 2x combo avg: ~5 TOURS/day per venue
        baseRewards[RewardType.VENUE_OPERATOR]        = 0.05 ether;
    }

    // ============================================
    // Core: Get Current Reward Amount
    // ============================================

    function getCurrentReward(RewardType rewardType) public view returns (uint256) {
        if (hasOverride[rewardType]) {
            return overrideRewards[rewardType];
        }

        uint256 base = baseRewards[rewardType];
        if (base == 0) return 0;

        uint256 epoch = _currentEpoch();

        if (epoch >= maxEpochs) {
            return minRewardFloor;
        }

        uint256 halved = base >> epoch;

        if (halved < minRewardFloor) {
            return minRewardFloor;
        }

        return halved;
    }

    function _currentEpoch() internal view returns (uint256) {
        uint256 elapsed = block.timestamp - deployedAt;
        return elapsed / halvingInterval;
    }

    function getCurrentEpoch() external view returns (uint256) {
        return _currentEpoch();
    }

    // ============================================
    // Distribute Rewards
    // ============================================

    function distributeReward(
        address recipient,
        RewardType rewardType
    ) external onlyDistributor whenNotPaused returns (uint256) {
        require(recipient != address(0), "Invalid recipient");

        uint256 today = block.timestamp / 86400;
        if (today > lastResetDay) {
            dailyDistributed = 0;
            lastResetDay = today;
        }

        uint256 amount = getCurrentReward(rewardType);
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

    function distributeRewardWithMultiplier(
        address recipient,
        RewardType rewardType,
        uint256 multiplierBps
    ) external onlyDistributor whenNotPaused returns (uint256) {
        require(recipient != address(0), "Invalid recipient");
        require(multiplierBps > 0 && multiplierBps <= 50000, "Invalid multiplier");

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

    function setBaseReward(RewardType rewardType, uint256 newRate) external onlyOwnerOrDAO {
        uint256 oldRate = baseRewards[rewardType];
        baseRewards[rewardType] = newRate;
        emit BaseRewardUpdated(rewardType, oldRate, newRate);
    }

    function setOverride(RewardType rewardType, uint256 rate) external onlyOwnerOrDAO {
        overrideRewards[rewardType] = rate;
        hasOverride[rewardType] = true;
        emit OverrideSet(rewardType, rate);
    }

    function clearOverride(RewardType rewardType) external onlyOwnerOrDAO {
        hasOverride[rewardType] = false;
        overrideRewards[rewardType] = 0;
        emit OverrideCleared(rewardType);
    }

    function setHalvingInterval(uint256 newInterval) external onlyOwnerOrDAO {
        require(newInterval > 0, "Invalid interval");
        halvingInterval = newInterval;
    }

    function setDailyCap(uint256 newCap) external onlyOwnerOrDAO {
        uint256 oldCap = dailyDistributionCap;
        dailyDistributionCap = newCap;
        emit DailyCapUpdated(oldCap, newCap);
    }

    function setMinRewardFloor(uint256 newFloor) external onlyOwnerOrDAO {
        minRewardFloor = newFloor;
    }

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

    function fundRewards(uint256 amount) external {
        toursToken.safeTransferFrom(msg.sender, address(this), amount);
    }

    // ============================================
    // View Functions
    // ============================================

    function getAllCurrentRewards() external view returns (
        uint256 listen,
        uint256 voiceNote,
        uint256 firstListen,
        uint256 streak7,
        uint256 itineraryComplete,
        uint256 tourGuideComplete,
        uint256 quest,
        uint256 artistMonthly,
        uint256 climbJournal,
        uint256 venueOperator
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
            getCurrentReward(RewardType.CLIMB_JOURNAL),
            getCurrentReward(RewardType.VENUE_OPERATOR)
        );
    }

    function getRewardPoolBalance() external view returns (uint256) {
        return toursToken.balanceOf(address(this));
    }

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

    function getNextHalvingTimestamp() external view returns (uint256) {
        uint256 epoch = _currentEpoch();
        if (epoch >= maxEpochs) return 0;
        return deployedAt + ((epoch + 1) * halvingInterval);
    }

    function previewRewardsAtEpoch(uint256 epoch) external view returns (
        uint256 listen,
        uint256 voiceNote,
        uint256 firstListen,
        uint256 streak7,
        uint256 venueOperator
    ) {
        uint256 e = epoch >= maxEpochs ? maxEpochs : epoch;

        uint256 l = baseRewards[RewardType.LISTEN] >> e;
        uint256 v = baseRewards[RewardType.VOICE_NOTE] >> e;
        uint256 f = baseRewards[RewardType.FIRST_LISTEN] >> e;
        uint256 s = baseRewards[RewardType.STREAK_7] >> e;
        uint256 vo = baseRewards[RewardType.VENUE_OPERATOR] >> e;

        return (
            l < minRewardFloor ? minRewardFloor : l,
            v < minRewardFloor ? minRewardFloor : v,
            f < minRewardFloor ? minRewardFloor : f,
            s < minRewardFloor ? minRewardFloor : s,
            vo < minRewardFloor ? minRewardFloor : vo
        );
    }
}
