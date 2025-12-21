// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IEmpowerToursNFT {
    enum NFTType { MUSIC, ART }
    function getMasterType(uint256 tokenId) external view returns (NFTType);
    function masterTokens(uint256 tokenId) external view returns (
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
 * @title MusicSubscription
 * @notice Platform-wide music streaming subscription with anti-bot protection
 *
 * Features:
 * - 300 WMON/month for unlimited music streaming across ALL artists
 * - Play-count based artist payouts (proportional distribution)
 * - 4 layers of anti-bot defense:
 *   1. On-chain play validation (duration, cooldowns, caps)
 *   2. API verification (captcha, IP limiting - handled off-chain)
 *   3. Behavior analysis (off-chain detection, on-chain slashing)
 *   4. Economic disincentive (1000 TOURS staking, slashed if caught)
 *   5. Community governance (subscribers vote to slash bots)
 *
 * Revenue Model:
 * - User pays 300 WMON/month → Access to ALL music
 * - Monthly pool distributed to artists by play count %
 * - Artist payout = (Artist plays / Total plays) × Revenue pool
 */
contract MusicSubscription is Ownable, ReentrancyGuard {
    IERC20 public wmonToken;
    IERC20 public toursToken;
    IEmpowerToursNFT public nftContract;

    address public treasury;
    address public oracle; // Trusted oracle for off-chain play verification

    // ============================================
    // Pricing & Economics
    // ============================================
    uint256 public constant MONTHLY_SUBSCRIPTION_PRICE = 300 ether; // 300 WMON (~$10.50, 4-12% cheaper than competitors)
    uint256 public constant SUBSCRIPTION_STAKE_REQUIRED = 1000 ether; // 1000 TOURS (gets slashed if caught botting)
    uint256 public constant PLATFORM_FEE_PERCENTAGE = 5; // 5% platform fee on subscription revenue

    // ============================================
    // Layer 1: On-Chain Play Validation
    // ============================================
    uint256 public constant MIN_PLAY_DURATION = 30; // 30 seconds minimum
    uint256 public constant REPLAY_COOLDOWN = 5 minutes; // 5 min between replays of same song
    uint256 public constant MAX_PLAYS_PER_USER_PER_DAY = 500; // 500 plays/day cap (~8 hours)
    uint256 public constant MAX_PLAYS_PER_SONG_PER_USER_PER_DAY = 100; // 100 plays of same song/day

    // ============================================
    // Subscription State
    // ============================================
    struct Subscription {
        uint256 expiry;
        uint256 stakedTours; // Staked TOURS (gets slashed if botting)
        bool active;
        uint256 totalPlays; // Lifetime play count
        uint256 flagVotes; // Community votes to slash
    }

    mapping(address => Subscription) public subscriptions;
    uint256 public totalActiveSubscribers;

    // ============================================
    // Layer 1: Play Tracking & Validation
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

    // artist => claimed month
    mapping(address => mapping(uint256 => bool)) public artistClaimedMonth;

    uint256 public currentMonth;

    // ============================================
    // Layer 3 & 4: Bot Detection & Slashing
    // ============================================
    mapping(address => bool) public flaggedAccounts;
    mapping(address => string) public flagReason;
    uint256 public constant VOTES_TO_SLASH = 100; // 100 community votes = auto-slash

    // ============================================
    // Events
    // ============================================
    event Subscribed(address indexed user, uint256 expiry, uint256 stakedAmount);
    event SubscriptionRenewed(address indexed user, uint256 newExpiry);
    event PlayRecorded(address indexed user, uint256 indexed masterTokenId, uint256 duration, uint256 timestamp);
    event MonthlyDistributionFinalized(uint256 indexed monthId, uint256 totalRevenue, uint256 totalPlays, uint256 perPlayRate);
    event ArtistPayout(uint256 indexed monthId, address indexed artist, uint256 amount, uint256 playCount);
    event AccountFlagged(address indexed user, string reason);
    event AccountSlashed(address indexed user, uint256 slashedAmount, string reason);
    event VoteToBan(address indexed voter, address indexed target, uint256 totalVotes);

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
     * @notice Subscribe for streaming access (requires TOURS staking)
     * @param months Number of months to subscribe for
     */
    function subscribe(uint256 months) external nonReentrant {
        require(months > 0 && months <= 12, "Invalid duration");

        Subscription storage sub = subscriptions[msg.sender];

        uint256 totalCost = MONTHLY_SUBSCRIPTION_PRICE * months;

        // Transfer subscription payment
        require(
            wmonToken.transferFrom(msg.sender, address(this), totalCost),
            "Payment failed"
        );

        // Layer 4: Require TOURS staking (first time only)
        if (sub.stakedTours == 0) {
            require(
                toursToken.transferFrom(msg.sender, address(this), SUBSCRIPTION_STAKE_REQUIRED),
                "Staking failed"
            );
            sub.stakedTours = SUBSCRIPTION_STAKE_REQUIRED;
        }

        // Update subscription
        if (sub.expiry < block.timestamp) {
            // New or expired subscription
            sub.expiry = block.timestamp + (months * 30 days);
            totalActiveSubscribers++;
        } else {
            // Extend existing subscription
            sub.expiry += (months * 30 days);
        }

        sub.active = true;

        // Add to current month's revenue
        uint256 monthId = block.timestamp / 30 days;
        monthlyStats[monthId].totalRevenue += totalCost;

        emit Subscribed(msg.sender, sub.expiry, sub.stakedTours);
    }

    /**
     * @notice Subscribe on behalf of another user (delegation support)
     * @param user The user to subscribe
     * @param months Number of months
     */
    function subscribeFor(address user, uint256 months) external nonReentrant {
        require(user != address(0), "Invalid user");
        require(months > 0 && months <= 12, "Invalid duration");

        Subscription storage sub = subscriptions[user];

        uint256 totalCost = MONTHLY_SUBSCRIPTION_PRICE * months;

        // Transfer subscription payment from caller (Safe)
        require(
            wmonToken.transferFrom(msg.sender, address(this), totalCost),
            "Payment failed"
        );

        // Layer 4: Require TOURS staking from user (first time only)
        if (sub.stakedTours == 0) {
            require(
                toursToken.transferFrom(user, address(this), SUBSCRIPTION_STAKE_REQUIRED),
                "Staking failed"
            );
            sub.stakedTours = SUBSCRIPTION_STAKE_REQUIRED;
        }

        // Update subscription
        if (sub.expiry < block.timestamp) {
            sub.expiry = block.timestamp + (months * 30 days);
            totalActiveSubscribers++;
        } else {
            sub.expiry += (months * 30 days);
        }

        sub.active = true;

        // Add to current month's revenue
        uint256 monthId = block.timestamp / 30 days;
        monthlyStats[monthId].totalRevenue += totalCost;

        emit Subscribed(user, sub.expiry, sub.stakedTours);
    }

    /**
     * @notice Unsubscribe and withdraw staked TOURS (if not flagged)
     */
    function unsubscribe() external nonReentrant {
        Subscription storage sub = subscriptions[msg.sender];
        require(sub.stakedTours > 0, "No stake to withdraw");
        require(!flaggedAccounts[msg.sender], "Account flagged - stake locked");

        uint256 stakeAmount = sub.stakedTours;
        sub.stakedTours = 0;
        sub.active = false;

        if (sub.expiry >= block.timestamp) {
            totalActiveSubscribers--;
        }

        // Return staked TOURS
        require(toursToken.transfer(msg.sender, stakeAmount), "Stake withdrawal failed");
    }

    // ============================================
    // Layer 1: Play Validation & Recording
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

        // Layer 1: Validation rules
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
        (address artist,,,,,,,,,,,) = nftContract.masterTokens(masterTokenId);
        artistMonthlyPlays[monthId][artist]++;

        emit PlayRecorded(user, masterTokenId, duration, block.timestamp);
    }

    // ============================================
    // Monthly Distribution (Artist Payouts)
    // ============================================

    /**
     * @notice Finalize monthly distribution (calculate per-play rate)
     * @param monthId The month to finalize (timestamp / 30 days)
     */
    function finalizeMonthlyDistribution(uint256 monthId) external onlyOwner {
        require(monthId < (block.timestamp / 30 days), "Month not ended yet");

        MonthlyStats storage stats = monthlyStats[monthId];
        require(!stats.finalized, "Already finalized");
        require(stats.totalRevenue > 0, "No revenue this month");
        require(stats.totalPlays > 0, "No plays this month");

        // Calculate platform fee (5%)
        uint256 platformFee = (stats.totalRevenue * PLATFORM_FEE_PERCENTAGE) / 100;
        uint256 artistPool = stats.totalRevenue - platformFee;

        // Transfer platform fee to treasury
        require(wmonToken.transfer(treasury, platformFee), "Platform fee transfer failed");

        stats.distributedAmount = artistPool;
        stats.finalized = true;

        uint256 perPlayRate = artistPool / stats.totalPlays;

        emit MonthlyDistributionFinalized(monthId, stats.totalRevenue, stats.totalPlays, perPlayRate);
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
    // Layer 3 & 4: Bot Detection & Slashing
    // ============================================

    /**
     * @notice Flag an account as suspicious (admin only, based on off-chain analysis)
     * @param user The user to flag
     * @param reason Reason for flagging
     */
    function flagAccount(address user, string calldata reason) external onlyOwner {
        flaggedAccounts[user] = true;
        flagReason[user] = reason;
        emit AccountFlagged(user, reason);
    }

    /**
     * @notice Slash a flagged account's staked TOURS
     * @param user The user to slash
     */
    function slashAccount(address user) external onlyOwner {
        require(flaggedAccounts[user], "Account not flagged");

        Subscription storage sub = subscriptions[user];
        uint256 slashedAmount = sub.stakedTours;
        require(slashedAmount > 0, "No stake to slash");

        sub.stakedTours = 0;
        sub.active = false;
        sub.expiry = 0;

        if (totalActiveSubscribers > 0) {
            totalActiveSubscribers--;
        }

        // Transfer slashed TOURS to treasury
        require(toursToken.transfer(treasury, slashedAmount), "Slash transfer failed");

        emit AccountSlashed(user, slashedAmount, flagReason[user]);
    }

    // ============================================
    // Layer 5: Community Governance
    // ============================================

    /**
     * @notice Vote to slash a suspicious account (subscribers only)
     * @param suspiciousAccount The account to vote against
     */
    function voteToSlash(address suspiciousAccount) external {
        Subscription storage voterSub = subscriptions[msg.sender];
        require(voterSub.active && voterSub.expiry >= block.timestamp, "Must be active subscriber");
        require(msg.sender != suspiciousAccount, "Cannot vote for yourself");

        Subscription storage targetSub = subscriptions[suspiciousAccount];
        require(targetSub.active, "Target not subscribed");

        targetSub.flagVotes++;

        emit VoteToBan(msg.sender, suspiciousAccount, targetSub.flagVotes);

        // Auto-slash if votes exceed threshold
        if (targetSub.flagVotes >= VOTES_TO_SLASH) {
            flaggedAccounts[suspiciousAccount] = true;
            flagReason[suspiciousAccount] = "Community voted";

            uint256 slashedAmount = targetSub.stakedTours;
            targetSub.stakedTours = 0;
            targetSub.active = false;
            targetSub.expiry = 0;

            if (totalActiveSubscribers > 0) {
                totalActiveSubscribers--;
            }

            require(toursToken.transfer(treasury, slashedAmount), "Slash transfer failed");

            emit AccountSlashed(suspiciousAccount, slashedAmount, "Community voted");
        }
    }

    /**
     * @notice Clear votes against an account (if proven legitimate)
     */
    function clearVotes(address user) external onlyOwner {
        subscriptions[user].flagVotes = 0;
        flaggedAccounts[user] = false;
        delete flagReason[user];
    }

    // ============================================
    // View Functions
    // ============================================

    function hasActiveSubscription(address user) external view returns (bool) {
        Subscription memory sub = subscriptions[user];
        return sub.active && sub.expiry >= block.timestamp && !flaggedAccounts[user];
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

    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        require(IERC20(token).transfer(owner(), amount), "Emergency withdraw failed");
    }
}
