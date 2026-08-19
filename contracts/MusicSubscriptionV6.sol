// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @dev The v3 `LicenseRegistry`. V5 talked to the V2 NFT through a 13-field `masterTokens`
 *      tuple decoded positionally; that is the decode style this repo has been bitten by, so
 *      V6 reads the named struct instead. `getMaster` is the only master read on the hot path.
 *
 *      The struct below must match `LicenseRegistry.Master` field for field. It is not
 *      self-enforcing, so `test_MasterStructShapeMatchesTheRegistry` pins it: the test mints a
 *      master with a distinct value in every field and asserts each one survives the decode.
 *      A field added, removed or reordered in the registry fails that test rather than
 *      silently returning a neighbouring field's value.
 */
interface IMusicRegistry {
    struct Master {
        address artist;
        uint256 artistFid;
        uint64 createdAt;
        uint32 maxCollectorEditions;
        uint32 collectorsMinted;
        uint8 nftType;
        address referrer;
        uint96 royaltyShareBps;
        address royaltyShareSink;
    }

    function getMaster(uint256 masterTokenId) external view returns (Master memory);

    /// @dev 0 = MUSIC, 1 = ART.
    function getMasterType(uint256 masterTokenId) external view returns (uint8);

    function artistMasterCount(address artist) external view returns (uint256);
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
 * @title MusicSubscriptionV6
 * @notice Platform-wide music streaming subscription. Pays artists pro-rata by play count.
 * @author EmpowerTours
 *
 * @dev V6 exists for one reason: **a listener no longer needs a Farcaster account.**
 *
 *      V5 was otherwise sound, and everything that carries value is carried over unchanged —
 *      the 10/20/70 split, the four tiers, the play limits, and the pull-based pro-rata payout
 *      that makes it impossible for plays to drain more than a month actually earned.
 *
 * ## What changed, and why
 *
 * **1. `require(userFid > 0)` is gone from `subscribe` and `subscribeFor`.**
 * This was the single line that made the app Farcaster-only. It gated the *listener*, never the
 * artist: every artist-side value path — `artistMonthlyPlays`, `artistLifetimePlays`,
 * `claimArtistPayout` — is keyed by address and never sees a FID. A wallet-only artist could
 * always have been paid; a wallet-only listener could not subscribe at all, so there was nothing
 * to pay them from.
 *
 * **2. The FID index is written only when a FID exists.**
 * `fidToAddress[userFid] = user` is now guarded by `userFid != 0`. Unguarded, every wallet-only
 * subscriber would overwrite `fidToAddress[0]`, so the reverse lookup would resolve to whoever
 * subscribed most recently. A wallet-only user simply has no FID entry, which is the truth.
 * Synthetic FIDs were considered and rejected — see docs/DEPLOYMENT_PLAN.md "Identity".
 *
 * **3. Masters are read from the v3 `LicenseRegistry`, not the V2 NFT.**
 * V5 cannot read a v3 master at all, so a master minted into v3 could never be played or paid.
 * That is why v3 and V6 are one deployment rather than two. See INTEGRATION_MATRIX.md BREAK 2.
 *
 * **4. `finalizeMonthlyDistribution` no longer strands funds.**
 * V5 required `totalPlays > 0`, so a month with revenue but no plays could never be finalized
 * and its WMON sat in the contract permanently — 120 WMON is stuck in V5 across months 682 and
 * 683 for exactly this reason. V6 finalizes such a month and routes the unclaimable artist pool
 * to the reserve. (The WMON already stranded in V5 is recoverable separately, via V5's
 * `emergencyWithdraw` — it is not this contract's state.)
 *
 * **5. Dead weight removed.** `voteToFlag` (community-voted banning: unreachable at this scale,
 * abusable at any scale) and `authorizedSubscribers`/`platformOperator`, which V5 wrote to and
 * never once read.
 *
 * ## What moderation may and may not do
 *
 * `flagAccount` stops *future* accrual. It does not and must not reach money already earned:
 * `claimArtistPayout` deliberately does not check `flaggedAccounts`. Recovering a fraudulent
 * payout is a separate, explicit governance action, never a side effect of a flag.
 */
contract MusicSubscriptionV6 is Ownable, ReentrancyGuard {

    // ============================================
    // Subscription Tiers
    // ============================================
    enum SubscriptionTier { DAILY, WEEKLY, MONTHLY, YEARLY }

    /// @dev Mirrors the registry's classification. Only MUSIC earns streaming revenue.
    uint8 public constant NFT_TYPE_MUSIC = 0;

    IERC20 public wmonToken;
    IToursRewardManager public rewardManager;
    IMusicRegistry public registry;

    address public treasury;
    address public oracle;
    address public daoTimelock;
    bool public paused;

    // ============================================
    // Pricing (in WMON) — unchanged from V5
    // ============================================
    uint256 public constant DAILY_PRICE = 15 ether;
    uint256 public constant WEEKLY_PRICE = 75 ether;
    uint256 public constant MONTHLY_PRICE = 300 ether;
    uint256 public constant YEARLY_PRICE = 3000 ether;

    // Distribution: 10% treasury, 20% reserve, 70% artist pool.
    uint256 public constant TREASURY_PERCENTAGE = 10;
    uint256 public constant RESERVE_PERCENTAGE = 20;
    uint256 public constant ARTIST_POOL_PERCENTAGE = 70;

    uint256 public totalReserve;

    /// @dev Subscription revenue taken in for months that have not been finalized yet. Every
    ///      WMON of it is still owed to somebody — treasury, reserve or artists.
    uint256 public unsettledRevenue;

    /// @dev Artist pool that has been finalized but not yet claimed. Floor division on payout
    ///      leaves at most a few wei per month in here permanently, which over-states the lock
    ///      very slightly. That is the direction to err in: it can only ever refuse a
    ///      withdrawal, never permit one that should be refused.
    uint256 public unclaimedArtistPool;

    // TOURS eligibility requirements
    uint256 public minMasterCount = 10;
    uint256 public minLifetimePlays = 100;

    // ============================================
    // Play Validation Limits — unchanged from V5
    // ============================================
    uint256 public constant MIN_PLAY_DURATION = 30;
    uint256 public constant REPLAY_COOLDOWN = 5 minutes;
    uint256 public constant MAX_PLAYS_PER_USER_PER_DAY = 500;
    uint256 public constant MAX_PLAYS_PER_SONG_PER_USER_PER_DAY = 100;

    // ============================================
    // Subscription State
    // ============================================

    /// @dev `userFid` is informational. It is 0 for a wallet-only subscriber and is never used
    ///      as a key — see {fidToAddress}.
    struct Subscription {
        uint256 userFid;
        uint256 expiry;
        bool active;
        uint256 totalPlays;
        SubscriptionTier lastTier;
    }

    mapping(address => Subscription) public subscriptions;

    /// @dev Reverse index, populated only for subscribers who actually have a FID. Key 0 is
    ///      never written, so it can never resolve to a wallet-only user.
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

    // ============================================
    // Account Moderation
    // ============================================
    mapping(address => bool) public flaggedAccounts;
    mapping(address => string) public flagReason;

    // ============================================
    // Events
    // ============================================
    event Subscribed(address indexed user, uint256 indexed userFid, SubscriptionTier tier, uint256 expiry, uint256 paidAmount);
    event PlayRecorded(address indexed user, uint256 indexed masterTokenId, uint256 duration, uint256 timestamp);
    event MonthlyDistributionFinalized(uint256 indexed monthId, uint256 totalRevenue, uint256 totalPlays, uint256 artistPool);
    event UnclaimableArtistPoolToReserve(uint256 indexed monthId, uint256 amount);
    event ArtistPayout(uint256 indexed monthId, address indexed artist, uint256 amount, uint256 playCount);
    event ArtistToursReward(uint256 indexed monthId, address indexed artist, uint256 toursAmount);
    event ReserveAdded(uint256 indexed monthId, uint256 amount, uint256 totalReserve);
    event ReserveWithdrawnToDAO(address indexed dao, uint256 amount);
    event AccountFlagged(address indexed user, string reason);
    event AccountUnflagged(address indexed user);
    event DAOTimelockUpdated(address indexed oldTimelock, address indexed newTimelock);
    event RewardManagerUpdated(address indexed oldManager, address indexed newManager);
    event RegistryUpdated(address indexed oldRegistry, address indexed newRegistry);
    event OracleUpdated(address indexed oldOracle, address indexed newOracle);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
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
        require(msg.sender == owner() || msg.sender == daoTimelock, "Only owner or DAO");
        _;
    }

    constructor(
        address _wmonToken,
        address _rewardManager,
        address _registry,
        address _treasury,
        address _oracle
    ) Ownable(msg.sender) {
        require(_wmonToken != address(0), "Invalid WMON token");
        require(_rewardManager != address(0), "Invalid RewardManager");
        require(_registry != address(0), "Invalid registry");
        require(_treasury != address(0), "Invalid treasury");
        require(_oracle != address(0), "Invalid oracle");

        wmonToken = IERC20(_wmonToken);
        rewardManager = IToursRewardManager(_rewardManager);
        registry = IMusicRegistry(_registry);
        treasury = _treasury;
        oracle = _oracle;
    }

    // ============================================
    // Subscription Management
    // ============================================

    /**
     * @notice Subscribe, paying from your own wallet.
     * @param tier Which tier to buy.
     * @param userFid The caller's Farcaster ID, or **0 if they do not have one**. Optional
     *        since V6; this is the change that opens the app to wallet-only listeners.
     */
    function subscribe(SubscriptionTier tier, uint256 userFid) external nonReentrant whenNotPaused {
        _subscribe(msg.sender, msg.sender, userFid, tier);
    }

    /**
     * @notice Subscribe on someone else's behalf, paying from the caller's balance.
     * @dev The app relays through this from the platform Safe, so the payer and the subscriber
     *      are routinely different addresses. The subscription lands on `user`; the WMON comes
     *      from `msg.sender`.
     * @param userFid `user`'s Farcaster ID, or 0 if they have none.
     */
    function subscribeFor(address user, uint256 userFid, SubscriptionTier tier)
        external
        nonReentrant
        whenNotPaused
    {
        require(user != address(0), "Invalid user");
        _subscribe(user, msg.sender, userFid, tier);
    }

    function _subscribe(address user, address payer, uint256 userFid, SubscriptionTier tier) private {
        uint256 cost = getTierPrice(tier);
        uint256 duration = getTierDuration(tier);

        require(wmonToken.transferFrom(payer, address(this), cost), "Payment failed");

        Subscription storage sub = subscriptions[user];

        if (sub.expiry < block.timestamp) {
            sub.expiry = block.timestamp + duration;
            sub.userFid = userFid;
            totalActiveSubscribers++;
        } else {
            sub.expiry += duration;
            // A returning subscriber who has since created a Farcaster account can attach it.
            // A 0 never clears an existing FID, so relaying without one is not destructive.
            if (userFid != 0) sub.userFid = userFid;
        }

        // Guarded: an unguarded write would make every wallet-only subscriber collide on
        // fidToAddress[0]. See the contract-level note "2." above.
        if (userFid != 0) fidToAddress[userFid] = user;

        sub.active = true;
        sub.lastTier = tier;

        monthlyStats[block.timestamp / 30 days].totalRevenue += cost;
        unsettledRevenue += cost;

        emit Subscribed(user, userFid, tier, sub.expiry, cost);
    }

    function getTierPrice(SubscriptionTier tier) public pure returns (uint256) {
        if (tier == SubscriptionTier.DAILY) return DAILY_PRICE;
        if (tier == SubscriptionTier.WEEKLY) return WEEKLY_PRICE;
        if (tier == SubscriptionTier.MONTHLY) return MONTHLY_PRICE;
        return YEARLY_PRICE;
    }

    function getTierDuration(SubscriptionTier tier) public pure returns (uint256) {
        if (tier == SubscriptionTier.DAILY) return 1 days;
        if (tier == SubscriptionTier.WEEKLY) return 7 days;
        if (tier == SubscriptionTier.MONTHLY) return 30 days;
        return 365 days;
    }

    // ============================================
    // Play Recording
    // ============================================

    /**
     * @notice Record a validated play. Oracle only.
     * @dev Identical validation to V5. The only difference is where the master comes from:
     *      the v3 registry's `getMaster`, decoded by name rather than by tuple position.
     */
    function recordPlay(
        address user,
        uint256 masterTokenId,
        uint256 duration
    ) external whenNotPaused {
        require(msg.sender == oracle, "Only oracle can record plays");

        Subscription storage sub = subscriptions[user];
        require(sub.active && sub.expiry >= block.timestamp, "Invalid subscription");
        require(!flaggedAccounts[user], "Account flagged");

        require(registry.getMasterType(masterTokenId) == NFT_TYPE_MUSIC, "Not a music NFT");
        require(duration >= MIN_PLAY_DURATION, "Play too short");

        uint256 currentDay = block.timestamp / 1 days;
        PlayRecord storage lastPlay = lastPlayTime[user][masterTokenId];

        require(block.timestamp - lastPlay.timestamp >= REPLAY_COOLDOWN, "Replay too soon");
        require(
            dailyPlayCount[user][currentDay] < MAX_PLAYS_PER_USER_PER_DAY,
            "Daily play limit exceeded"
        );
        require(
            dailySongPlayCount[user][currentDay][masterTokenId] < MAX_PLAYS_PER_SONG_PER_USER_PER_DAY,
            "Song play limit exceeded"
        );

        address artist = registry.getMaster(masterTokenId).artist;
        require(artist != address(0), "Master not found");

        lastPlay.timestamp = block.timestamp;
        lastPlay.duration = duration;
        dailyPlayCount[user][currentDay]++;
        dailySongPlayCount[user][currentDay][masterTokenId]++;
        sub.totalPlays++;

        uint256 monthId = block.timestamp / 30 days;
        monthlyStats[monthId].totalPlays++;
        artistMonthlyPlays[monthId][artist]++;
        artistLifetimePlays[artist]++;

        emit PlayRecorded(user, masterTokenId, duration, block.timestamp);
    }

    // ============================================
    // Monthly Distribution
    // ============================================

    /**
     * @notice Close a month and fix the size of its artist pool.
     * @dev V5 additionally required `totalPlays > 0`. That looked like a sanity check and was
     *      actually a fund trap: a month that took revenue but recorded no plays could never be
     *      finalized, and its WMON became permanently unreachable — there is no other path out
     *      of this contract for subscription revenue. V6 finalizes the month and moves the
     *      pool nobody can claim into the reserve, where governance can still reach it.
     */
    function finalizeMonthlyDistribution(uint256 monthId) external onlyOwner {
        require(monthId < (block.timestamp / 30 days), "Month not ended yet");

        MonthlyStats storage stats = monthlyStats[monthId];
        require(!stats.finalized, "Already finalized");
        require(stats.totalRevenue > 0, "No revenue this month");

        uint256 treasuryAmount = (stats.totalRevenue * TREASURY_PERCENTAGE) / 100;
        uint256 reserveAmount = (stats.totalRevenue * RESERVE_PERCENTAGE) / 100;
        uint256 artistPool = stats.totalRevenue - treasuryAmount - reserveAmount;

        if (stats.totalPlays == 0) {
            // Payouts are pro-rata on play count, so with no plays there is no share anyone
            // could ever claim. Sweep it to the reserve instead of leaving it stuck.
            emit UnclaimableArtistPoolToReserve(monthId, artistPool);
            reserveAmount += artistPool;
            artistPool = 0;
        }

        // Effects before the transfer.
        stats.distributedAmount = artistPool;
        stats.finalized = true;
        totalReserve += reserveAmount;
        unclaimedArtistPool += artistPool;
        unsettledRevenue -= stats.totalRevenue;

        require(wmonToken.transfer(treasury, treasuryAmount), "Treasury transfer failed");

        emit ReserveAdded(monthId, reserveAmount, totalReserve);
        emit MonthlyDistributionFinalized(monthId, stats.totalRevenue, stats.totalPlays, artistPool);
    }

    /**
     * @notice Claim your pro-rata share of a finalized month.
     * @dev Deliberately does not check `flaggedAccounts`. A flag stops future accrual; it never
     *      confiscates what was already earned.
     */
    function claimArtistPayout(uint256 monthId) external nonReentrant {
        uint256 payout = _accrueClaim(monthId, msg.sender);
        require(payout > 0, "No payouts available");
        require(wmonToken.transfer(msg.sender, payout), "Payout transfer failed");
    }

    function batchClaimArtistPayouts(uint256[] calldata monthIds) external nonReentrant {
        uint256 totalPayout = 0;
        for (uint256 i = 0; i < monthIds.length; i++) {
            totalPayout += _accrueClaim(monthIds[i], msg.sender);
        }
        require(totalPayout > 0, "No payouts available");
        require(wmonToken.transfer(msg.sender, totalPayout), "Payout transfer failed");
    }

    /// @dev Returns 0 rather than reverting so a batch tolerates months with nothing to claim.
    function _accrueClaim(uint256 monthId, address artist) private returns (uint256 payout) {
        MonthlyStats storage stats = monthlyStats[monthId];

        if (!stats.finalized) return 0;
        if (artistClaimedMonth[artist][monthId]) return 0;

        uint256 playCount = artistMonthlyPlays[monthId][artist];
        if (playCount == 0) return 0;

        // playCount > 0 implies totalPlays > 0, so this division is safe by construction.
        payout = (playCount * stats.distributedAmount) / stats.totalPlays;

        artistMonthlyPayouts[monthId][artist] = payout;
        artistClaimedMonth[artist][monthId] = true;
        unclaimedArtistPool -= payout;

        emit ArtistPayout(monthId, artist, payout, playCount);
    }

    // ============================================
    // Account Moderation
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
        if (subscriptions[user].expiry >= block.timestamp) {
            subscriptions[user].active = true;
        }
        emit AccountUnflagged(user);
    }

    // ============================================
    // View Functions
    // ============================================

    function hasActiveSubscription(address user) external view returns (bool) {
        Subscription memory sub = subscriptions[user];
        return sub.active && sub.expiry >= block.timestamp && !flaggedAccounts[user];
    }

    /// @dev `userFid` is 0 for a wallet-only subscriber. Callers must not treat 0 as an error.
    function getSubscriptionInfo(address user) external view returns (
        uint256 userFid,
        uint256 expiry,
        bool active,
        uint256 totalPlays,
        SubscriptionTier lastTier,
        bool isFlagged
    ) {
        Subscription memory sub = subscriptions[user];
        return (sub.userFid, sub.expiry, sub.active, sub.totalPlays, sub.lastTier, flaggedAccounts[user]);
    }

    /**
     * @notice Reverse lookup by Farcaster ID.
     * @dev Returns the zero address for `fid = 0` and for any FID that never subscribed. A
     *      wallet-only subscriber is not reachable here by design — look them up by address.
     */
    function getSubscriptionByFid(uint256 fid) external view returns (
        address user,
        uint256 expiry,
        bool active,
        uint256 totalPlays,
        SubscriptionTier lastTier
    ) {
        if (fid == 0) return (address(0), 0, false, 0, SubscriptionTier.DAILY);
        address userAddr = fidToAddress[fid];
        Subscription memory sub = subscriptions[userAddr];
        return (userAddr, sub.expiry, sub.active, sub.totalPlays, sub.lastTier);
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
        return dailyPlayCount[user][block.timestamp / 1 days];
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

    function getCurrentMonthlyToursReward() external view returns (uint256) {
        return rewardManager.getCurrentReward(IToursRewardManager.RewardType.ARTIST_MONTHLY);
    }

    // ============================================
    // TOURS Rewards
    // ============================================

    /**
     * @dev Against V2 this view reverted with empty data, because V2 never implemented
     *      `artistMasterCount` — INTEGRATION_MATRIX.md BREAK 1. The v3 registry implements it,
     *      so eligibility is now a question of thresholds rather than of reachability.
     */
    function isArtistEligible(address artist) public view returns (
        bool eligible,
        uint256 masterCount,
        uint256 lifetimePlays
    ) {
        masterCount = registry.artistMasterCount(artist);
        lifetimePlays = artistLifetimePlays[artist];
        eligible = masterCount >= minMasterCount && lifetimePlays >= minLifetimePlays;
    }

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
                artistToursClaimedMonth[monthId][msg.sender] = false;
            }
        }

        require(totalTours > 0, "No TOURS rewards distributed");
    }

    // ============================================
    // Reserve
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
    // Admin
    // ============================================

    function setOracle(address newOracle) external onlyOwner {
        require(newOracle != address(0), "Invalid oracle");
        emit OracleUpdated(oracle, newOracle);
        oracle = newOracle;
    }

    function setTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "Invalid treasury");
        emit TreasuryUpdated(treasury, newTreasury);
        treasury = newTreasury;
    }

    function setRegistry(address newRegistry) external onlyOwner {
        require(newRegistry != address(0), "Invalid registry");
        emit RegistryUpdated(address(registry), newRegistry);
        registry = IMusicRegistry(newRegistry);
    }

    function setRewardManager(address _rewardManager) external onlyOwnerOrDAO {
        require(_rewardManager != address(0), "Invalid address");
        emit RewardManagerUpdated(address(rewardManager), _rewardManager);
        rewardManager = IToursRewardManager(_rewardManager);
    }

    function setDAOTimelock(address _daoTimelock) external onlyOwner {
        emit DAOTimelockUpdated(daoTimelock, _daoTimelock);
        daoTimelock = _daoTimelock;
    }

    function setEligibilityRequirements(uint256 _minMasterCount, uint256 _minLifetimePlays)
        external
        onlyOwnerOrDAO
    {
        minMasterCount = _minMasterCount;
        minLifetimePlays = _minLifetimePlays;
    }

    function pause() external onlyOwnerOrDAO {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwnerOrDAO {
        paused = false;
        emit Unpaused(msg.sender);
    }

    /**
     * @notice Recover tokens sent here by mistake.
     * @dev Cannot touch WMON that artists are still owed. `totalReserve` plus every unclaimed
     *      finalized pool is off limits; only the genuine surplus is withdrawable. V5 had no
     *      such guard — its `emergencyWithdraw` could take the artist pool.
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        if (token == address(wmonToken)) {
            uint256 balance = wmonToken.balanceOf(address(this));
            uint256 locked = lockedWmon();
            require(balance > locked && amount <= balance - locked, "Would take money owed to artists");
        }
        require(IERC20(token).transfer(owner(), amount), "Emergency withdraw failed");
    }

    /**
     * @notice WMON this contract holds that is already owed to somebody.
     * @dev Three running balances, each maintained at the point the money moves rather than
     *      recomputed by scanning months — a scan would be unbounded and would silently miss
     *      any month nobody thought to pass in.
     *
     *      Conservation: a subscription's WMON enters `unsettledRevenue`; finalizing splits it
     *      into the treasury (which leaves the contract), `totalReserve` and
     *      `unclaimedArtistPool`; claiming drains the last of those. Anything above this sum is
     *      a genuine surplus — a mistaken transfer in — and only that is withdrawable.
     */
    function lockedWmon() public view returns (uint256) {
        return totalReserve + unsettledRevenue + unclaimedArtistPool;
    }
}
