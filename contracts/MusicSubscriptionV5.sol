// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IEmpowerToursNFT {
    enum NFTType { MUSIC, ART }
    function getMasterType(uint256 tokenId) external view returns (NFTType);
    function artistMasterCount(address artist) external view returns (uint256);
    function masterTokens(uint256 tokenId) external view returns (
        uint256 artistFid,
        address originalArtist,
        string memory tokenURI,
        string memory collectorTokenURI,
        uint256 price,
        uint256 collectorPrice,
        uint256 totalSold,
        uint256 activeLicenses,
        uint256 maxCollectorEditions,
        uint256 collectorsMinted,
        bool active,
        NFTType nftType,
        uint96 royaltyPercentage
    );
}

interface IToursRewardManager {
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

    function getCurrentReward(RewardType rewardType) external view returns (uint256);
    function distributeReward(address recipient, RewardType rewardType) external returns (uint256);
}

/**
 * @title MusicSubscriptionV5
 * @notice Platform-wide music streaming subscription with flexible tiers
 * @author EmpowerTours
 *
 * @dev V5 Changes from V4:
 * - Replaced hardcoded monthlyToursReward with ToursRewardManager
 * - TOURS rewards distributed directly via RewardManager (halving schedule)
 * - Contract no longer holds TOURS tokens
 * - Added setRewardManager for upgradability
 * - Removed setEligibilityRequirements monthlyToursReward param (rate in RewardManager)
 *
 * Previous V4 Changes:
 * - DAO timelock support for flagAccount/unflagAccount
 * - platformOperator role for registering authorized subscribers
 * - Emergency pause
 *
 * Revenue Model:
 * - Users pay WMON based on tier -> Access to ALL music
 * - Monthly pool distributed to artists by play count %
 * - Eligible artists receive TOURS via RewardManager (halving schedule)
 */
contract MusicSubscriptionV5 is Ownable, ReentrancyGuard {

    // ============================================
    // Subscription Tiers
    // ============================================
    enum SubscriptionTier { DAILY, WEEKLY, MONTHLY, YEARLY }

    IERC20 public wmonToken;
    IToursRewardManager public rewardManager;       // V5: Replaces toursToken
    IEmpowerToursNFT public nftContract;

    address public treasury;
    address public oracle;

    // ============================================
    // Authorization State
    // ============================================
    mapping(address => bool) public authorizedSubscribers;
    address public platformOperator;
    address public daoTimelock;
    bool public paused;

    // ============================================
    // Pricing (in WMON)
    // ============================================
    uint256 public constant DAILY_PRICE = 15 ether;
    uint256 public constant WEEKLY_PRICE = 75 ether;
    uint256 public constant MONTHLY_PRICE = 300 ether;
    uint256 public constant YEARLY_PRICE = 3000 ether;

    // Distribution Model: 10% Treasury, 20% Reserve, 70% Artist Pool
    uint256 public constant TREASURY_PERCENTAGE = 10;
    uint256 public constant RESERVE_PERCENTAGE = 20;
    uint256 public constant ARTIST_POOL_PERCENTAGE = 70;

    uint256 public totalReserve;

    // TOURS eligibility requirements
    uint256 public minMasterCount = 10;
    uint256 public minLifetimePlays = 100;

    // ============================================
    // Play Validation Limits
    // ============================================
    uint256 public constant MIN_PLAY_DURATION = 30;
    uint256 public constant REPLAY_COOLDOWN = 5 minutes;
    uint256 public constant MAX_PLAYS_PER_USER_PER_DAY = 500;
    uint256 public constant MAX_PLAYS_PER_SONG_PER_USER_PER_DAY = 100;

    // ============================================
    // Subscription State
    // ============================================
    struct Subscription {
        uint256 userFid;
        uint256 expiry;
        bool active;
        uint256 totalPlays;
        uint256 flagVotes;
        SubscriptionTier lastTier;
    }

    mapping(address => Subscription) public subscriptions;
    mapping(uint256 => address) public fidToAddress;
    uint256 public totalActiveSubscribers;

    // ============================================
    // Play Tracking
    // ============================================
    struct PlayRecord {
        uint256 timestamp;
        uint256 duration;
    }

    mapping(address => mapping(uint256 => PlayRecord)) public lastPlayTime;
    mapping(address => mapping(uint256 => uint256)) public dailyPlayCount;
    mapping(address => mapping(uint256 => mapping(uint256 => uint256))) public dailySongPlayCount;

    // ============================================
    // Monthly Distribution State
    // ============================================
    struct MonthlyStats {
        uint256 totalRevenue;
        uint256 totalPlays;
        uint256 distributedAmount;
        bool finalized;
    }

    mapping(uint256 => MonthlyStats) public monthlyStats;
    mapping(uint256 => mapping(address => uint256)) public artistMonthlyPlays;
    mapping(uint256 => mapping(address => uint256)) public artistMonthlyPayouts;
    mapping(address => mapping(uint256 => bool)) public artistClaimedMonth;
    mapping(address => uint256) public artistLifetimePlays;
    mapping(uint256 => mapping(address => bool)) public artistToursClaimedMonth;

    uint256 public currentMonth;

    // ============================================
    // Bot Detection
    // ============================================
    mapping(address => bool) public flaggedAccounts;
    mapping(address => string) public flagReason;
    uint256 public constant VOTES_TO_FLAG = 50;

    // ============================================
    // Events
    // ============================================
    event Subscribed(address indexed user, uint256 indexed userFid, SubscriptionTier tier, uint256 expiry, uint256 paidAmount);
    event SubscriptionRenewed(address indexed user, uint256 newExpiry);
    event PlayRecorded(address indexed user, uint256 indexed masterTokenId, uint256 duration, uint256 timestamp);
    event MonthlyDistributionFinalized(uint256 indexed monthId, uint256 totalRevenue, uint256 totalPlays, uint256 artistPool);
    event ArtistPayout(uint256 indexed monthId, address indexed artist, uint256 amount, uint256 playCount);
    event ArtistToursReward(uint256 indexed monthId, address indexed artist, uint256 toursAmount);
    event ReserveAdded(uint256 indexed monthId, uint256 amount, uint256 totalReserve);
    event ReserveWithdrawnToDAO(address indexed dao, uint256 amount);
    event AccountFlagged(address indexed user, string reason);
    event AccountUnflagged(address indexed user);
    event VoteToFlag(address indexed voter, address indexed target, uint256 totalVotes);

    // V4/V5 Events
    event PlatformOperatorUpdated(address indexed operator);
    event UserSafeRegisteredAsSubscriber(address indexed userSafe);
    event AuthorizedSubscriberUpdated(address indexed subscriber, bool authorized);
    event DAOTimelockUpdated(address indexed oldTimelock, address indexed newTimelock);
    event RewardManagerUpdated(address indexed oldManager, address indexed newManager);
    event Paused(address indexed by);
    event Unpaused(address indexed by);

    // ============================================
    // Modifiers
    // ============================================

    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }

    modifier onlyOwnerOrDAO() {
        require(
            msg.sender == owner() || msg.sender == daoTimelock,
            "Only owner or DAO"
        );
        _;
    }

    constructor(
        address _wmonToken,
        address _rewardManager,
        address _nftContract,
        address _treasury,
        address _oracle
    ) Ownable(msg.sender) {
        require(_wmonToken != address(0), "Invalid WMON token");
        require(_rewardManager != address(0), "Invalid RewardManager");
        require(_nftContract != address(0), "Invalid NFT contract");
        require(_treasury != address(0), "Invalid treasury");
        require(_oracle != address(0), "Invalid oracle");

        wmonToken = IERC20(_wmonToken);
        rewardManager = IToursRewardManager(_rewardManager);
        nftContract = IEmpowerToursNFT(_nftContract);
        treasury = _treasury;
        oracle = _oracle;

        currentMonth = block.timestamp / 30 days;
    }

    // ============================================
    // Authorization Management
    // ============================================

    function setPlatformOperator(address operator) external onlyOwner {
        platformOperator = operator;
        emit PlatformOperatorUpdated(operator);
    }

    function registerUserSafeAsSubscriber(address userSafe) external {
        require(msg.sender == platformOperator, "Only platform operator");
        authorizedSubscribers[userSafe] = true;
        emit UserSafeRegisteredAsSubscriber(userSafe);
    }

    function setAuthorizedSubscriber(address subscriber, bool authorized) external onlyOwnerOrDAO {
        authorizedSubscribers[subscriber] = authorized;
        emit AuthorizedSubscriberUpdated(subscriber, authorized);
    }

    function setDAOTimelock(address _daoTimelock) external onlyOwner {
        address oldTimelock = daoTimelock;
        daoTimelock = _daoTimelock;
        emit DAOTimelockUpdated(oldTimelock, _daoTimelock);
    }

    function pause() external onlyOwnerOrDAO {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwnerOrDAO {
        paused = false;
        emit Unpaused(msg.sender);
    }

    // ============================================
    // V5: Reward Manager
    // ============================================

    function setRewardManager(address _rewardManager) external onlyOwnerOrDAO {
        require(_rewardManager != address(0), "Invalid address");
        address old = address(rewardManager);
        rewardManager = IToursRewardManager(_rewardManager);
        emit RewardManagerUpdated(old, _rewardManager);
    }

    // ============================================
    // Subscription Management
    // ============================================

    function subscribe(SubscriptionTier tier, uint256 userFid) external nonReentrant whenNotPaused {
        require(userFid > 0, "Invalid FID");
        Subscription storage sub = subscriptions[msg.sender];

        uint256 cost = getTierPrice(tier);
        uint256 duration = getTierDuration(tier);

        require(
            wmonToken.transferFrom(msg.sender, address(this), cost),
            "Payment failed"
        );

        if (sub.expiry < block.timestamp) {
            sub.expiry = block.timestamp + duration;
            sub.userFid = userFid;
            fidToAddress[userFid] = msg.sender;
            totalActiveSubscribers++;
        } else {
            sub.expiry += duration;
        }

        sub.active = true;
        sub.lastTier = tier;

        uint256 monthId = block.timestamp / 30 days;
        monthlyStats[monthId].totalRevenue += cost;

        emit Subscribed(msg.sender, userFid, tier, sub.expiry, cost);
    }

    function subscribeFor(address user, uint256 userFid, SubscriptionTier tier) external nonReentrant whenNotPaused {
        require(user != address(0), "Invalid user");
        require(userFid > 0, "Invalid FID");

        Subscription storage sub = subscriptions[user];

        uint256 cost = getTierPrice(tier);
        uint256 duration = getTierDuration(tier);

        require(
            wmonToken.transferFrom(msg.sender, address(this), cost),
            "Payment failed"
        );

        if (sub.expiry < block.timestamp) {
            sub.expiry = block.timestamp + duration;
            sub.userFid = userFid;
            fidToAddress[userFid] = user;
            totalActiveSubscribers++;
        } else {
            sub.expiry += duration;
        }

        sub.active = true;
        sub.lastTier = tier;

        uint256 monthId = block.timestamp / 30 days;
        monthlyStats[monthId].totalRevenue += cost;

        emit Subscribed(user, userFid, tier, sub.expiry, cost);
    }

    function getTierPrice(SubscriptionTier tier) public pure returns (uint256) {
        if (tier == SubscriptionTier.DAILY) return DAILY_PRICE;
        if (tier == SubscriptionTier.WEEKLY) return WEEKLY_PRICE;
        if (tier == SubscriptionTier.MONTHLY) return MONTHLY_PRICE;
        if (tier == SubscriptionTier.YEARLY) return YEARLY_PRICE;
        revert("Invalid tier");
    }

    function getTierDuration(SubscriptionTier tier) public pure returns (uint256) {
        if (tier == SubscriptionTier.DAILY) return 1 days;
        if (tier == SubscriptionTier.WEEKLY) return 7 days;
        if (tier == SubscriptionTier.MONTHLY) return 30 days;
        if (tier == SubscriptionTier.YEARLY) return 365 days;
        revert("Invalid tier");
    }

    // ============================================
    // Play Validation
    // ============================================

    function recordPlay(
        address user,
        uint256 masterTokenId,
        uint256 duration
    ) external whenNotPaused {
        require(msg.sender == oracle, "Only oracle can record plays");

        Subscription storage sub = subscriptions[user];
        require(sub.active && sub.expiry >= block.timestamp, "Invalid subscription");
        require(!flaggedAccounts[user], "Account flagged");

        IEmpowerToursNFT.NFTType nftType = nftContract.getMasterType(masterTokenId);
        require(nftType == IEmpowerToursNFT.NFTType.MUSIC, "Not a music NFT");

        require(duration >= MIN_PLAY_DURATION, "Play too short");

        uint256 currentDay = block.timestamp / 1 days;
        PlayRecord storage lastPlay = lastPlayTime[user][masterTokenId];

        require(
            block.timestamp - lastPlay.timestamp >= REPLAY_COOLDOWN,
            "Replay too soon"
        );

        require(
            dailyPlayCount[user][currentDay] < MAX_PLAYS_PER_USER_PER_DAY,
            "Daily play limit exceeded"
        );
        require(
            dailySongPlayCount[user][currentDay][masterTokenId] < MAX_PLAYS_PER_SONG_PER_USER_PER_DAY,
            "Song play limit exceeded"
        );

        lastPlay.timestamp = block.timestamp;
        lastPlay.duration = duration;
        dailyPlayCount[user][currentDay]++;
        dailySongPlayCount[user][currentDay][masterTokenId]++;
        sub.totalPlays++;

        uint256 monthId = block.timestamp / 30 days;
        monthlyStats[monthId].totalPlays++;

        (, address artist,,,,,,,,,,, ) = nftContract.masterTokens(masterTokenId);
        artistMonthlyPlays[monthId][artist]++;
        artistLifetimePlays[artist]++;

        emit PlayRecorded(user, masterTokenId, duration, block.timestamp);
    }

    // ============================================
    // Monthly Distribution
    // ============================================

    function finalizeMonthlyDistribution(uint256 monthId) external onlyOwner {
        require(monthId < (block.timestamp / 30 days), "Month not ended yet");

        MonthlyStats storage stats = monthlyStats[monthId];
        require(!stats.finalized, "Already finalized");
        require(stats.totalRevenue > 0, "No revenue this month");
        require(stats.totalPlays > 0, "No plays this month");

        uint256 treasuryAmount = (stats.totalRevenue * TREASURY_PERCENTAGE) / 100;
        uint256 reserveAmount = (stats.totalRevenue * RESERVE_PERCENTAGE) / 100;
        uint256 artistPool = stats.totalRevenue - treasuryAmount - reserveAmount;

        require(wmonToken.transfer(treasury, treasuryAmount), "Treasury transfer failed");

        totalReserve += reserveAmount;
        emit ReserveAdded(monthId, reserveAmount, totalReserve);

        stats.distributedAmount = artistPool;
        stats.finalized = true;

        emit MonthlyDistributionFinalized(monthId, stats.totalRevenue, stats.totalPlays, artistPool);
    }

    function claimArtistPayout(uint256 monthId) external nonReentrant {
        require(monthlyStats[monthId].finalized, "Month not finalized");
        require(!artistClaimedMonth[msg.sender][monthId], "Already claimed");

        uint256 playCount = artistMonthlyPlays[monthId][msg.sender];
        require(playCount > 0, "No plays this month");

        MonthlyStats storage stats = monthlyStats[monthId];

        uint256 payout = (playCount * stats.distributedAmount) / stats.totalPlays;

        artistMonthlyPayouts[monthId][msg.sender] = payout;
        artistClaimedMonth[msg.sender][monthId] = true;

        require(wmonToken.transfer(msg.sender, payout), "Payout transfer failed");

        emit ArtistPayout(monthId, msg.sender, payout, playCount);
    }

    function batchClaimArtistPayouts(uint256[] calldata monthIds) external nonReentrant {
        uint256 totalPayout = 0;

        for (uint256 i = 0; i < monthIds.length; i++) {
            uint256 monthId = monthIds[i];

            if (!monthlyStats[monthId].finalized) continue;
            if (artistClaimedMonth[msg.sender][monthId]) continue;

            uint256 playCount = artistMonthlyPlays[monthId][msg.sender];
            if (playCount == 0) continue;

            MonthlyStats storage stats = monthlyStats[monthId];
            uint256 payout = (playCount * stats.distributedAmount) / stats.totalPlays;

            artistMonthlyPayouts[monthId][msg.sender] = payout;
            artistClaimedMonth[msg.sender][monthId] = true;
            totalPayout += payout;

            emit ArtistPayout(monthId, msg.sender, payout, playCount);
        }

        require(totalPayout > 0, "No payouts available");
        require(wmonToken.transfer(msg.sender, totalPayout), "Payout transfer failed");
    }

    // ============================================
    // Bot Detection (DAO can flag/unflag)
    // ============================================

    function flagAccount(address user, string calldata reason) external onlyOwnerOrDAO {
        flaggedAccounts[user] = true;
        flagReason[user] = reason;
        subscriptions[user].active = false;
        emit AccountFlagged(user, reason);
    }

    function unflagAccount(address user) external onlyOwnerOrDAO {
        flaggedAccounts[user] = false;
        delete flagReason[user];
        subscriptions[user].flagVotes = 0;

        if (subscriptions[user].expiry >= block.timestamp) {
            subscriptions[user].active = true;
        }

        emit AccountUnflagged(user);
    }

    function voteToFlag(address suspiciousAccount) external whenNotPaused {
        Subscription storage voterSub = subscriptions[msg.sender];
        require(voterSub.active && voterSub.expiry >= block.timestamp, "Must be active subscriber");
        require(msg.sender != suspiciousAccount, "Cannot vote for yourself");

        Subscription storage targetSub = subscriptions[suspiciousAccount];
        require(targetSub.active, "Target not subscribed");

        targetSub.flagVotes++;

        emit VoteToFlag(msg.sender, suspiciousAccount, targetSub.flagVotes);

        if (targetSub.flagVotes >= VOTES_TO_FLAG) {
            flaggedAccounts[suspiciousAccount] = true;
            flagReason[suspiciousAccount] = "Community voted";
            targetSub.active = false;

            emit AccountFlagged(suspiciousAccount, "Community voted");
        }
    }

    function clearVotes(address user) external onlyOwnerOrDAO {
        subscriptions[user].flagVotes = 0;
    }

    // ============================================
    // View Functions
    // ============================================

    function hasActiveSubscription(address user) external view returns (bool) {
        Subscription memory sub = subscriptions[user];
        return sub.active && sub.expiry >= block.timestamp && !flaggedAccounts[user];
    }

    function getSubscriptionInfo(address user) external view returns (
        uint256 userFid,
        uint256 expiry,
        bool active,
        uint256 totalPlays,
        uint256 flagVotes,
        SubscriptionTier lastTier,
        bool isFlagged
    ) {
        Subscription memory sub = subscriptions[user];
        return (
            sub.userFid,
            sub.expiry,
            sub.active,
            sub.totalPlays,
            sub.flagVotes,
            sub.lastTier,
            flaggedAccounts[user]
        );
    }

    function getSubscriptionByFid(uint256 fid) external view returns (
        address user,
        uint256 expiry,
        bool active,
        uint256 totalPlays,
        SubscriptionTier lastTier
    ) {
        address userAddr = fidToAddress[fid];
        Subscription memory sub = subscriptions[userAddr];
        return (
            userAddr,
            sub.expiry,
            sub.active,
            sub.totalPlays,
            sub.lastTier
        );
    }

    function getArtistMonthlyStats(address artist, uint256 monthId) external view returns (
        uint256 playCount,
        uint256 payout,
        bool claimed
    ) {
        return (
            artistMonthlyPlays[monthId][artist],
            artistMonthlyPayouts[monthId][artist],
            artistClaimedMonth[artist][monthId]
        );
    }

    function getUserDailyPlays(address user) external view returns (uint256) {
        uint256 currentDay = block.timestamp / 1 days;
        return dailyPlayCount[user][currentDay];
    }

    function getCurrentMonthStats() external view returns (
        uint256 monthId,
        uint256 totalRevenue,
        uint256 totalPlays,
        bool finalized
    ) {
        monthId = block.timestamp / 30 days;
        MonthlyStats memory stats = monthlyStats[monthId];
        return (monthId, stats.totalRevenue, stats.totalPlays, stats.finalized);
    }

    /**
     * @notice Get current monthly TOURS reward rate from RewardManager
     * @dev V5: Rate follows halving schedule
     */
    function getCurrentMonthlyToursReward() external view returns (uint256) {
        return rewardManager.getCurrentReward(IToursRewardManager.RewardType.ARTIST_MONTHLY);
    }

    // ============================================
    // TOURS Rewards (V5: Via RewardManager)
    // ============================================

    function isArtistEligible(address artist) public view returns (
        bool eligible,
        uint256 masterCount,
        uint256 lifetimePlays
    ) {
        masterCount = nftContract.artistMasterCount(artist);
        lifetimePlays = artistLifetimePlays[artist];
        eligible = masterCount >= minMasterCount && lifetimePlays >= minLifetimePlays;
    }

    /**
     * @notice Claim TOURS reward for an eligible artist
     * @dev V5: Reward distributed directly from ToursRewardManager
     */
    function claimToursReward(uint256 monthId) external nonReentrant {
        require(monthlyStats[monthId].finalized, "Month not finalized");
        require(!artistToursClaimedMonth[monthId][msg.sender], "TOURS already claimed");
        require(artistMonthlyPlays[monthId][msg.sender] > 0, "No plays this month");

        (bool eligible,,) = isArtistEligible(msg.sender);
        require(eligible, "Not eligible for TOURS reward");

        artistToursClaimedMonth[monthId][msg.sender] = true;

        uint256 reward = rewardManager.distributeReward(
            msg.sender,
            IToursRewardManager.RewardType.ARTIST_MONTHLY
        );

        emit ArtistToursReward(monthId, msg.sender, reward);
    }

    /**
     * @notice Batch claim TOURS rewards for multiple months
     * @dev V5: Each month's reward distributed via RewardManager at current rate
     */
    function batchClaimToursRewards(uint256[] calldata monthIds) external nonReentrant {
        (bool eligible,,) = isArtistEligible(msg.sender);
        require(eligible, "Not eligible for TOURS reward");

        uint256 totalTours = 0;

        for (uint256 i = 0; i < monthIds.length; i++) {
            uint256 monthId = monthIds[i];

            if (!monthlyStats[monthId].finalized) continue;
            if (artistToursClaimedMonth[monthId][msg.sender]) continue;
            if (artistMonthlyPlays[monthId][msg.sender] == 0) continue;

            artistToursClaimedMonth[monthId][msg.sender] = true;

            try rewardManager.distributeReward(
                msg.sender,
                IToursRewardManager.RewardType.ARTIST_MONTHLY
            ) returns (uint256 reward) {
                totalTours += reward;
                emit ArtistToursReward(monthId, msg.sender, reward);
            } catch {
                // Revert the claim flag if distribution failed
                artistToursClaimedMonth[monthId][msg.sender] = false;
            }
        }

        require(totalTours > 0, "No TOURS rewards distributed");
    }

    // ============================================
    // Reserve & DAO Functions
    // ============================================

    function withdrawReserveToDAO(address dao, uint256 amount) external onlyOwnerOrDAO {
        require(dao != address(0), "Invalid DAO address");

        uint256 withdrawAmount = amount == 0 ? totalReserve : amount;
        require(withdrawAmount <= totalReserve, "Insufficient reserve");

        totalReserve -= withdrawAmount;
        require(wmonToken.transfer(dao, withdrawAmount), "Reserve transfer failed");

        emit ReserveWithdrawnToDAO(dao, withdrawAmount);
    }

    function getReserveBalance() external view returns (uint256) {
        return totalReserve;
    }

    // ============================================
    // Admin Functions
    // ============================================

    function setOracle(address newOracle) external onlyOwner {
        require(newOracle != address(0), "Invalid oracle");
        oracle = newOracle;
    }

    function setTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "Invalid treasury");
        treasury = newTreasury;
    }

    /**
     * @notice Set eligibility requirements for TOURS rewards
     * @dev V5: monthlyToursReward removed (rate is in RewardManager)
     */
    function setEligibilityRequirements(
        uint256 _minMasterCount,
        uint256 _minLifetimePlays
    ) external onlyOwnerOrDAO {
        minMasterCount = _minMasterCount;
        minLifetimePlays = _minLifetimePlays;
    }

    /**
     * @notice Emergency withdraw WMON tokens
     * @dev V5: Contract no longer holds TOURS (all TOURS in RewardManager)
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        require(IERC20(token).transfer(owner(), amount), "Emergency withdraw failed");
    }
}
