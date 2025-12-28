// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

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

/**
 * @title MusicSubscriptionV2
 * @notice Platform-wide music streaming subscription with flexible tiers
 *
 * Features:
 * - Multiple subscription tiers: Daily, Weekly, Monthly, Yearly
 * - Play-count based artist payouts (proportional distribution)
 * - Anti-bot protection (no TOURS staking required)
 * - Community governance for flagging bots
 *
 * Revenue Model:
 * - Users pay WMON based on tier → Access to ALL music
 * - Monthly pool distributed to artists by play count %
 * - Artist payout = (Artist plays / Total plays) × Revenue pool
 */
contract MusicSubscriptionV2 is Ownable, ReentrancyGuard {

    // ============================================
    // Subscription Tiers
    // ============================================
    enum SubscriptionTier { DAILY, WEEKLY, MONTHLY, YEARLY }

    IERC20 public wmonToken;
    IERC20 public toursToken;
    IEmpowerToursNFT public nftContract;

    address public treasury;
    address public oracle; // Trusted oracle for off-chain play verification

    // ============================================
    // Pricing (in WMON) - ~$0.035/WMON
    // ============================================
    uint256 public constant DAILY_PRICE = 15 ether;      // 15 WMON (~$0.52/day)
    uint256 public constant WEEKLY_PRICE = 75 ether;     // 75 WMON (~$2.62/week, 15% discount)
    uint256 public constant MONTHLY_PRICE = 300 ether;   // 300 WMON (~$10.50/month)
    uint256 public constant YEARLY_PRICE = 3000 ether;   // 3000 WMON (~$105/year, 15% discount)

    // Distribution Model: 10% Treasury, 20% Reserve (in contract), 70% Artist Pool
    uint256 public constant TREASURY_PERCENTAGE = 10;
    uint256 public constant RESERVE_PERCENTAGE = 20;
    uint256 public constant ARTIST_POOL_PERCENTAGE = 70;

    // Reserve fund stays in contract until DAO is deployed
    uint256 public totalReserve;

    // TOURS rewards for eligible artists
    uint256 public minMasterCount = 10;      // Min NFTs minted to be eligible
    uint256 public minLifetimePlays = 100;   // Min lifetime plays to be eligible
    uint256 public monthlyToursReward = 1 ether; // 1 TOURS/month for eligible artists

    // ============================================
    // Play Validation Limits
    // ============================================
    uint256 public constant MIN_PLAY_DURATION = 30; // 30 seconds minimum
    uint256 public constant REPLAY_COOLDOWN = 5 minutes; // 5 min between replays
    uint256 public constant MAX_PLAYS_PER_USER_PER_DAY = 500; // 500 plays/day (~8 hours)
    uint256 public constant MAX_PLAYS_PER_SONG_PER_USER_PER_DAY = 100; // 100 plays of same song/day

    // ============================================
    // Subscription State
    // ============================================
    struct Subscription {
        uint256 userFid;    // User's Farcaster ID
        uint256 expiry;
        bool active;
        uint256 totalPlays; // Lifetime play count
        uint256 flagVotes; // Community votes for flagging
        SubscriptionTier lastTier; // Last purchased tier
    }

    mapping(address => Subscription) public subscriptions;
    mapping(uint256 => address) public fidToAddress; // FID => user address
    uint256 public totalActiveSubscribers;

    // ============================================
    // Play Tracking & Validation
    // ============================================
    struct PlayRecord {
        uint256 timestamp;
        uint256 duration;
    }

    // user => masterTokenId => last play record
    mapping(address => mapping(uint256 => PlayRecord)) public lastPlayTime;

    // user => day (timestamp / 1 day) => play count
    mapping(address => mapping(uint256 => uint256)) public dailyPlayCount;

    // user => day => masterTokenId => play count
    mapping(address => mapping(uint256 => mapping(uint256 => uint256))) public dailySongPlayCount;

    // ============================================
    // Monthly Distribution State
    // ============================================
    struct MonthlyStats {
        uint256 totalRevenue; // Total WMON collected
        uint256 totalPlays; // Total validated plays
        uint256 distributedAmount; // Amount distributed to artists
        bool finalized; // Whether distribution is complete
    }

    // monthId (timestamp / 30 days) => stats
    mapping(uint256 => MonthlyStats) public monthlyStats;

    // monthId => artist => play count
    mapping(uint256 => mapping(address => uint256)) public artistMonthlyPlays;

    // monthId => artist => payout amount
    mapping(uint256 => mapping(address => uint256)) public artistMonthlyPayouts;

    // artist => claimed month (WMON payout)
    mapping(address => mapping(uint256 => bool)) public artistClaimedMonth;

    // artist => lifetime plays (for TOURS eligibility)
    mapping(address => uint256) public artistLifetimePlays;

    // monthId => artist => TOURS reward claimed
    mapping(uint256 => mapping(address => bool)) public artistToursClaimedMonth;

    uint256 public currentMonth;

    // ============================================
    // Bot Detection & Flagging
    // ============================================
    mapping(address => bool) public flaggedAccounts;
    mapping(address => string) public flagReason;
    uint256 public constant VOTES_TO_FLAG = 50; // 50 community votes = auto-flag

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

    constructor(
        address _wmonToken,
        address _toursToken,
        address _nftContract,
        address _treasury,
        address _oracle
    ) Ownable(msg.sender) {
        require(_wmonToken != address(0), "Invalid WMON token");
        require(_toursToken != address(0), "Invalid TOURS token");
        require(_nftContract != address(0), "Invalid NFT contract");
        require(_treasury != address(0), "Invalid treasury");
        require(_oracle != address(0), "Invalid oracle");

        wmonToken = IERC20(_wmonToken);
        toursToken = IERC20(_toursToken);
        nftContract = IEmpowerToursNFT(_nftContract);
        treasury = _treasury;
        oracle = _oracle;

        currentMonth = block.timestamp / 30 days;
    }

    // ============================================
    // Subscription Management
    // ============================================

    /**
     * @notice Subscribe for streaming access
     * @param tier Subscription tier (DAILY, WEEKLY, MONTHLY, YEARLY)
     * @param userFid User's Farcaster ID
     */
    function subscribe(SubscriptionTier tier, uint256 userFid) external nonReentrant {
        require(userFid > 0, "Invalid FID");
        Subscription storage sub = subscriptions[msg.sender];

        uint256 cost = getTierPrice(tier);
        uint256 duration = getTierDuration(tier);

        // Transfer subscription payment
        require(
            wmonToken.transferFrom(msg.sender, address(this), cost),
            "Payment failed"
        );

        // Update subscription
        if (sub.expiry < block.timestamp) {
            // New or expired subscription
            sub.expiry = block.timestamp + duration;
            sub.userFid = userFid;
            fidToAddress[userFid] = msg.sender;
            totalActiveSubscribers++;
        } else {
            // Extend existing subscription
            sub.expiry += duration;
        }

        sub.active = true;
        sub.lastTier = tier;

        // Add to current month's revenue
        uint256 monthId = block.timestamp / 30 days;
        monthlyStats[monthId].totalRevenue += cost;

        emit Subscribed(msg.sender, userFid, tier, sub.expiry, cost);
    }

    /**
     * @notice Subscribe on behalf of another user (delegation support)
     * @param user The user to subscribe
     * @param userFid User's Farcaster ID
     * @param tier Subscription tier
     */
    function subscribeFor(address user, uint256 userFid, SubscriptionTier tier) external nonReentrant {
        require(user != address(0), "Invalid user");
        require(userFid > 0, "Invalid FID");

        Subscription storage sub = subscriptions[user];

        uint256 cost = getTierPrice(tier);
        uint256 duration = getTierDuration(tier);

        // Transfer subscription payment from caller (Safe)
        require(
            wmonToken.transferFrom(msg.sender, address(this), cost),
            "Payment failed"
        );

        // Update subscription
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

        // Add to current month's revenue
        uint256 monthId = block.timestamp / 30 days;
        monthlyStats[monthId].totalRevenue += cost;

        emit Subscribed(user, userFid, tier, sub.expiry, cost);
    }

    /**
     * @notice Get price for a subscription tier
     */
    function getTierPrice(SubscriptionTier tier) public pure returns (uint256) {
        if (tier == SubscriptionTier.DAILY) return DAILY_PRICE;
        if (tier == SubscriptionTier.WEEKLY) return WEEKLY_PRICE;
        if (tier == SubscriptionTier.MONTHLY) return MONTHLY_PRICE;
        if (tier == SubscriptionTier.YEARLY) return YEARLY_PRICE;
        revert("Invalid tier");
    }

    /**
     * @notice Get duration for a subscription tier
     */
    function getTierDuration(SubscriptionTier tier) public pure returns (uint256) {
        if (tier == SubscriptionTier.DAILY) return 1 days;
        if (tier == SubscriptionTier.WEEKLY) return 7 days;
        if (tier == SubscriptionTier.MONTHLY) return 30 days;
        if (tier == SubscriptionTier.YEARLY) return 365 days;
        revert("Invalid tier");
    }

    // ============================================
    // Play Validation & Recording
    // ============================================

    /**
     * @notice Record a play (called by oracle after off-chain verification)
     * @param user The user who played the song
     * @param masterTokenId The master token ID of the song
     * @param duration Play duration in seconds
     */
    function recordPlay(
        address user,
        uint256 masterTokenId,
        uint256 duration
    ) external {
        require(msg.sender == oracle, "Only oracle can record plays");

        Subscription storage sub = subscriptions[user];
        require(sub.active && sub.expiry >= block.timestamp, "Invalid subscription");
        require(!flaggedAccounts[user], "Account flagged");

        // Verify it's a music NFT
        IEmpowerToursNFT.NFTType nftType = nftContract.getMasterType(masterTokenId);
        require(nftType == IEmpowerToursNFT.NFTType.MUSIC, "Not a music NFT");

        // Validation rules
        require(duration >= MIN_PLAY_DURATION, "Play too short");

        uint256 currentDay = block.timestamp / 1 days;
        PlayRecord storage lastPlay = lastPlayTime[user][masterTokenId];

        // Check replay cooldown
        require(
            block.timestamp - lastPlay.timestamp >= REPLAY_COOLDOWN,
            "Replay too soon"
        );

        // Check daily play limits
        require(
            dailyPlayCount[user][currentDay] < MAX_PLAYS_PER_USER_PER_DAY,
            "Daily play limit exceeded"
        );
        require(
            dailySongPlayCount[user][currentDay][masterTokenId] < MAX_PLAYS_PER_SONG_PER_USER_PER_DAY,
            "Song play limit exceeded"
        );

        // Record play
        lastPlay.timestamp = block.timestamp;
        lastPlay.duration = duration;
        dailyPlayCount[user][currentDay]++;
        dailySongPlayCount[user][currentDay][masterTokenId]++;
        sub.totalPlays++;

        // Add to monthly stats
        uint256 monthId = block.timestamp / 30 days;
        monthlyStats[monthId].totalPlays++;

        // Get artist address from NFT contract
        (, address artist,,,,,,,,,,, ) = nftContract.masterTokens(masterTokenId);
        artistMonthlyPlays[monthId][artist]++;
        artistLifetimePlays[artist]++;

        emit PlayRecorded(user, masterTokenId, duration, block.timestamp);
    }

    // ============================================
    // Monthly Distribution (Artist Payouts)
    // ============================================

    /**
     * @notice Finalize monthly distribution (10% treasury, 20% reserve, 70% artist pool)
     * @param monthId The month to finalize (timestamp / 30 days)
     */
    function finalizeMonthlyDistribution(uint256 monthId) external onlyOwner {
        require(monthId < (block.timestamp / 30 days), "Month not ended yet");

        MonthlyStats storage stats = monthlyStats[monthId];
        require(!stats.finalized, "Already finalized");
        require(stats.totalRevenue > 0, "No revenue this month");
        require(stats.totalPlays > 0, "No plays this month");

        // Distribution: 10% Treasury, 20% Reserve, 70% Artist Pool
        uint256 treasuryAmount = (stats.totalRevenue * TREASURY_PERCENTAGE) / 100;
        uint256 reserveAmount = (stats.totalRevenue * RESERVE_PERCENTAGE) / 100;
        uint256 artistPool = stats.totalRevenue - treasuryAmount - reserveAmount;

        // Transfer treasury portion
        require(wmonToken.transfer(treasury, treasuryAmount), "Treasury transfer failed");

        // Reserve stays in contract
        totalReserve += reserveAmount;
        emit ReserveAdded(monthId, reserveAmount, totalReserve);

        stats.distributedAmount = artistPool;
        stats.finalized = true;

        emit MonthlyDistributionFinalized(monthId, stats.totalRevenue, stats.totalPlays, artistPool);
    }

    /**
     * @notice Artist claims their monthly payout
     * @param monthId The month to claim
     */
    function claimArtistPayout(uint256 monthId) external nonReentrant {
        require(monthlyStats[monthId].finalized, "Month not finalized");
        require(!artistClaimedMonth[msg.sender][monthId], "Already claimed");

        uint256 playCount = artistMonthlyPlays[monthId][msg.sender];
        require(playCount > 0, "No plays this month");

        MonthlyStats storage stats = monthlyStats[monthId];

        // Calculate payout: (artist plays / total plays) * artist pool
        uint256 payout = (playCount * stats.distributedAmount) / stats.totalPlays;

        artistMonthlyPayouts[monthId][msg.sender] = payout;
        artistClaimedMonth[msg.sender][monthId] = true;

        require(wmonToken.transfer(msg.sender, payout), "Payout transfer failed");

        emit ArtistPayout(monthId, msg.sender, payout, playCount);
    }

    /**
     * @notice Batch claim multiple months (gas optimization)
     * @param monthIds Array of month IDs to claim
     */
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
    // Bot Detection & Flagging
    // ============================================

    /**
     * @notice Flag an account as suspicious (admin only)
     * @param user The user to flag
     * @param reason Reason for flagging
     */
    function flagAccount(address user, string calldata reason) external onlyOwner {
        flaggedAccounts[user] = true;
        flagReason[user] = reason;
        subscriptions[user].active = false;
        emit AccountFlagged(user, reason);
    }

    /**
     * @notice Unflag an account (if proven legitimate)
     */
    function unflagAccount(address user) external onlyOwner {
        flaggedAccounts[user] = false;
        delete flagReason[user];
        subscriptions[user].flagVotes = 0;

        // Reactivate subscription if not expired
        if (subscriptions[user].expiry >= block.timestamp) {
            subscriptions[user].active = true;
        }

        emit AccountUnflagged(user);
    }

    /**
     * @notice Vote to flag a suspicious account (subscribers only)
     * @param suspiciousAccount The account to vote against
     */
    function voteToFlag(address suspiciousAccount) external {
        Subscription storage voterSub = subscriptions[msg.sender];
        require(voterSub.active && voterSub.expiry >= block.timestamp, "Must be active subscriber");
        require(msg.sender != suspiciousAccount, "Cannot vote for yourself");

        Subscription storage targetSub = subscriptions[suspiciousAccount];
        require(targetSub.active, "Target not subscribed");

        targetSub.flagVotes++;

        emit VoteToFlag(msg.sender, suspiciousAccount, targetSub.flagVotes);

        // Auto-flag if votes exceed threshold
        if (targetSub.flagVotes >= VOTES_TO_FLAG) {
            flaggedAccounts[suspiciousAccount] = true;
            flagReason[suspiciousAccount] = "Community voted";
            targetSub.active = false;

            emit AccountFlagged(suspiciousAccount, "Community voted");
        }
    }

    /**
     * @notice Clear votes against an account
     */
    function clearVotes(address user) external onlyOwner {
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

    // ============================================
    // TOURS Rewards for Eligible Artists
    // ============================================

    /**
     * @notice Check if an artist is eligible for TOURS rewards
     * @param artist The artist address
     * @return eligible Whether artist meets requirements
     * @return masterCount Number of masters minted
     * @return lifetimePlays Lifetime play count
     */
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
     * @notice Eligible artists claim monthly TOURS reward
     * @param monthId The month to claim TOURS for
     */
    function claimToursReward(uint256 monthId) external nonReentrant {
        require(monthlyStats[monthId].finalized, "Month not finalized");
        require(!artistToursClaimedMonth[monthId][msg.sender], "TOURS already claimed");
        require(artistMonthlyPlays[monthId][msg.sender] > 0, "No plays this month");

        (bool eligible,,) = isArtistEligible(msg.sender);
        require(eligible, "Not eligible for TOURS reward");

        artistToursClaimedMonth[monthId][msg.sender] = true;

        require(toursToken.transfer(msg.sender, monthlyToursReward), "TOURS transfer failed");

        emit ArtistToursReward(monthId, msg.sender, monthlyToursReward);
    }

    /**
     * @notice Batch claim TOURS for multiple months
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
            totalTours += monthlyToursReward;

            emit ArtistToursReward(monthId, msg.sender, monthlyToursReward);
        }

        require(totalTours > 0, "No TOURS rewards available");
        require(toursToken.transfer(msg.sender, totalTours), "TOURS transfer failed");
    }

    // ============================================
    // Reserve & DAO Functions
    // ============================================

    /**
     * @notice Withdraw reserve to DAO contract (when DAO is deployed)
     * @param dao The DAO contract address
     * @param amount Amount to withdraw (0 = all)
     */
    function withdrawReserveToDAO(address dao, uint256 amount) external onlyOwner {
        require(dao != address(0), "Invalid DAO address");

        uint256 withdrawAmount = amount == 0 ? totalReserve : amount;
        require(withdrawAmount <= totalReserve, "Insufficient reserve");

        totalReserve -= withdrawAmount;
        require(wmonToken.transfer(dao, withdrawAmount), "Reserve transfer failed");

        emit ReserveWithdrawnToDAO(dao, withdrawAmount);
    }

    /**
     * @notice Get current reserve balance
     */
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
     * @notice Update TOURS eligibility requirements (for DAO governance)
     */
    function setEligibilityRequirements(
        uint256 _minMasterCount,
        uint256 _minLifetimePlays,
        uint256 _monthlyToursReward
    ) external onlyOwner {
        minMasterCount = _minMasterCount;
        minLifetimePlays = _minLifetimePlays;
        monthlyToursReward = _monthlyToursReward;
    }

    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        require(IERC20(token).transfer(owner(), amount), "Emergency withdraw failed");
    }
}
