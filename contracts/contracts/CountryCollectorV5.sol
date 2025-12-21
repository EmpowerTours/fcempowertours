// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SwitchboardTypes} from "@switchboard-xyz/on-demand-solidity/libraries/SwitchboardTypes.sol";
import {ISwitchboard} from "@switchboard-xyz/on-demand-solidity/interfaces/ISwitchboard.sol";

/**
 * @title CountryCollectorV5
 * @notice V5 with Switchboard updateFee payment support
 * @dev Uses Switchboard oracles to randomly select artists from a country pool
 */
contract CountryCollectorV5 is Ownable, ReentrancyGuard {

    // ========================================================================
    // STRUCTURES
    // ========================================================================

    struct WeeklyCountryChallenge {
        uint256 id;
        string countryCode;
        string countryName;
        uint256[3] artistIds;
        uint256 startTime;
        uint256 endTime;
        uint256 rewardPool;
        bool active;
        bool finalized;
        bool randomnessRequested;
        bool randomnessFulfilled;
    }

    struct UserCountryProgress {
        uint256 weekId;
        address user;
        bool[3] artistsCompleted;
        uint256 completedCount;
        uint256 lastCompletedAt;
        bool badgeEarned;
    }

    struct CollectorStats {
        uint256 countriesCollected;
        uint256 totalBadges;
        uint256 artistsCompleted;
        uint256 weeklyStreak;
        uint256 longestStreak;
        uint256 totalRewards;
        uint256 lastCompletedWeek;
    }

    struct CountryBadge {
        string countryCode;
        string countryName;
        uint256 earnedAt;
        bool isGlobalCitizen;
    }

    struct RandomnessRequest {
        uint256 weekId;
        bytes32 randomnessId;
        string countryCode;
        string countryName;
        uint256 requestedAt;
        bool fulfilled;
    }

    // ========================================================================
    // STATE
    // ========================================================================

    ISwitchboard public switchboard;

    mapping(uint256 => WeeklyCountryChallenge) public weeklyChallenges;
    mapping(uint256 => mapping(address => UserCountryProgress)) public userProgress;
    mapping(address => CollectorStats) public collectorStats;
    mapping(address => CountryBadge[]) public userBadges;
    mapping(uint256 => RandomnessRequest) public randomnessRequests;

    uint256 private _weekIdCounter;
    IERC20 public toursToken;
    address public keeper;
    address public resolver; // Bot that resolves randomness

    // Switchboard Queues
    bytes32 private constant TESTNET_QUEUE = 0xc9477bfb5ff1012859f336cf98725680e7705ba2abece17188cfb28ca66ca5b0;
    bytes32 private constant MAINNET_QUEUE = 0x86807068432f186a147cf0b13a30067d386204ea9d6c8b04743ac2ef010b0752;
    bytes32 public immutable queue;

    // Rewards
    uint256 public constant ARTIST_COMPLETION_REWARD = 5 ether;
    uint256 public constant BADGE_REWARD = 50 ether;
    uint256 public constant GLOBAL_CITIZEN_BONUS = 100 ether;
    uint256 public constant GLOBAL_CITIZEN_THRESHOLD = 10;

    // Timing
    uint256 public constant CHALLENGE_DURATION = 7 days;
    uint64 public constant MIN_SETTLEMENT_DELAY = 5; // 5 seconds

    // ========================================================================
    // EVENTS
    // ========================================================================

    event RandomArtistsRequested(
        uint256 indexed weekId,
        bytes32 indexed randomnessId,
        string countryCode,
        string countryName,
        uint256 requestedAt,
        address indexed caller
    );

    event ChallengeCreatedWithRandomArtists(
        uint256 indexed weekId,
        string indexed countryCode,
        string countryName,
        uint256[3] artistIds,
        uint256 randomValue,
        uint256 startTime,
        uint256 endTime
    );

    event ArtistCompleted(
        uint256 indexed weekId,
        address indexed user,
        uint256 artistIndex,
        uint256 artistId,
        uint256 rewardEarned
    );

    event BadgeEarned(
        uint256 indexed weekId,
        address indexed user,
        string countryCode,
        string countryName,
        uint256 rewardEarned
    );

    event GlobalCitizenAchieved(
        address indexed user,
        uint256 countriesCollected,
        uint256 bonusReward
    );

    event WeekFinalized(
        uint256 indexed weekId,
        uint256 totalCompletions
    );

    // ========================================================================
    // MODIFIERS
    // ========================================================================

    modifier onlyKeeper() {
        require(msg.sender == keeper || msg.sender == owner(), "Not keeper or owner");
        _;
    }

    modifier onlyResolver() {
        require(msg.sender == resolver || msg.sender == owner(), "Not resolver or owner");
        _;
    }

    // ========================================================================
    // CONSTRUCTOR
    // ========================================================================

    constructor(
        address _switchboard,
        address _toursToken,
        address _keeper,
        address _resolver
    ) Ownable(msg.sender) {
        require(_switchboard != address(0), "Invalid Switchboard");
        require(_toursToken != address(0), "Invalid TOURS token");
        require(_keeper != address(0), "Invalid keeper");
        require(_resolver != address(0), "Invalid resolver");

        switchboard = ISwitchboard(_switchboard);
        toursToken = IERC20(_toursToken);
        keeper = _keeper;
        resolver = _resolver;

        // Auto-detect network: Monad Mainnet = 143, Testnet = 10143
        queue = block.chainid == 143 ? MAINNET_QUEUE : TESTNET_QUEUE;
    }

    // ========================================================================
    // RANDOMNESS REQUEST (Step 1: Keeper/Cron calls this)
    // ========================================================================

    /**
     * @dev Request random artist selection for a country
     * @param country Country name
     * @param countryCode ISO country code
     */
    function requestRandomArtistSelection(
        string memory country,
        string memory countryCode
    ) external onlyKeeper returns (uint256 weekId) {
        require(bytes(country).length > 0, "Country required");
        require(bytes(countryCode).length == 2, "Invalid country code");

        weekId = _weekIdCounter++;

        // Generate unique randomness ID
        bytes32 randomnessId = keccak256(abi.encodePacked(
            weekId,
            countryCode,
            block.timestamp,
            block.number,
            address(this),
            "CountryCollector"
        ));

        // Step 1: Request randomness from Switchboard (auto-assigns oracle)
        switchboard.createRandomness(
            randomnessId,
            MIN_SETTLEMENT_DELAY
        );

        // Store randomness request
        randomnessRequests[weekId] = RandomnessRequest({
            weekId: weekId,
            randomnessId: randomnessId,
            countryCode: countryCode,
            countryName: country,
            requestedAt: block.timestamp,
            fulfilled: false
        });

        // Create empty challenge
        weeklyChallenges[weekId].id = weekId;
        weeklyChallenges[weekId].countryCode = countryCode;
        weeklyChallenges[weekId].countryName = country;
        weeklyChallenges[weekId].randomnessRequested = true;
        weeklyChallenges[weekId].startTime = block.timestamp;

        emit RandomArtistsRequested(weekId, randomnessId, countryCode, country, block.timestamp, msg.sender);

        return weekId;
    }

    // ========================================================================
    // RANDOMNESS RESOLUTION (Step 2: Bot calls this with Switchboard proof)
    // ========================================================================

    /**
     * @dev Create challenge with randomly selected artists
     * @param weekId The week ID
     * @param encodedRandomness Switchboard randomness proof
     * @param artistIds Array of 3 randomly selected artist IDs
     */
    function createChallengeWithRandomArtists(
        uint256 weekId,
        bytes calldata encodedRandomness,
        uint256[3] memory artistIds
    ) external payable onlyResolver nonReentrant {
        RandomnessRequest storage request = randomnessRequests[weekId];
        require(!request.fulfilled, "Already fulfilled");
        require(request.randomnessId != bytes32(0), "Invalid request");

        WeeklyCountryChallenge storage challenge = weeklyChallenges[weekId];
        require(challenge.randomnessRequested, "Randomness not requested");
        require(!challenge.randomnessFulfilled, "Already fulfilled");
        require(artistIds[0] > 0 && artistIds[1] > 0 && artistIds[2] > 0, "All artist IDs required");

        // Settle randomness with Switchboard (requires updateFee payment)
        uint256 updateFee = switchboard.updateFee();
        require(msg.value >= updateFee, "Insufficient fee");
        switchboard.settleRandomness{value: updateFee}(encodedRandomness);
        SwitchboardTypes.Randomness memory randomness = switchboard.getRandomness(request.randomnessId);

        // Refund excess payment
        if (msg.value > updateFee) {
            (bool success, ) = msg.sender.call{value: msg.value - updateFee}("");
            require(success, "Refund failed");
        }

        require(randomness.settledAt != 0, "Randomness not settled");

        // Populate challenge with artist IDs
        challenge.artistIds = artistIds;
        challenge.endTime = challenge.startTime + CHALLENGE_DURATION;
        challenge.rewardPool = BADGE_REWARD + (3 * ARTIST_COMPLETION_REWARD);
        challenge.active = true;
        challenge.randomnessFulfilled = true;

        // Mark request as fulfilled
        request.fulfilled = true;

        emit ChallengeCreatedWithRandomArtists(
            weekId,
            challenge.countryCode,
            challenge.countryName,
            artistIds,
            randomness.value,
            challenge.startTime,
            challenge.endTime
        );
    }

    // ========================================================================
    // GAMEPLAY - DELEGATION SUPPORT
    // ========================================================================

    function completeArtistFor(
        address beneficiary,
        uint256 weekId,
        uint256 artistIndex,
        uint256 artistId
    ) public nonReentrant {
        WeeklyCountryChallenge storage challenge = weeklyChallenges[weekId];
        require(challenge.active, "Challenge not active");
        require(challenge.randomnessFulfilled, "Challenge not ready");
        require(block.timestamp <= challenge.endTime, "Challenge ended");
        require(artistIndex < 3, "Invalid artist index");
        require(challenge.artistIds[artistIndex] == artistId, "Artist ID mismatch");

        UserCountryProgress storage progress = userProgress[weekId][beneficiary];
        require(!progress.artistsCompleted[artistIndex], "Artist already completed");

        // Mark artist as completed
        progress.weekId = weekId;
        progress.user = beneficiary;
        progress.artistsCompleted[artistIndex] = true;
        progress.completedCount++;
        progress.lastCompletedAt = block.timestamp;

        // Award discovery bonus
        require(toursToken.transfer(beneficiary, ARTIST_COMPLETION_REWARD), "Reward transfer failed");

        // Update stats
        CollectorStats storage stats = collectorStats[beneficiary];
        stats.artistsCompleted++;
        stats.totalRewards += ARTIST_COMPLETION_REWARD;

        emit ArtistCompleted(weekId, beneficiary, artistIndex, artistId, ARTIST_COMPLETION_REWARD);

        // Check if all 3 artists completed
        if (progress.completedCount == 3 && !progress.badgeEarned) {
            _awardBadge(beneficiary, weekId, challenge);
        }
    }

    function completeArtist(
        uint256 weekId,
        uint256 artistIndex,
        uint256 artistId
    ) external nonReentrant {
        completeArtistFor(msg.sender, weekId, artistIndex, artistId);
    }

    // ========================================================================
    // INTERNAL FUNCTIONS
    // ========================================================================

    function _awardBadge(
        address user,
        uint256 weekId,
        WeeklyCountryChallenge storage challenge
    ) internal {
        UserCountryProgress storage progress = userProgress[weekId][user];
        progress.badgeEarned = true;

        // Award badge reward
        require(toursToken.transfer(user, BADGE_REWARD), "Badge reward transfer failed");

        // Update stats
        CollectorStats storage stats = collectorStats[user];
        stats.countriesCollected++;
        stats.totalBadges++;
        stats.totalRewards += BADGE_REWARD;

        // Update streak
        uint256 currentWeek = block.timestamp / 1 weeks;
        if (stats.lastCompletedWeek == currentWeek - 1) {
            stats.weeklyStreak++;
        } else {
            stats.weeklyStreak = 1;
        }
        stats.lastCompletedWeek = currentWeek;

        if (stats.weeklyStreak > stats.longestStreak) {
            stats.longestStreak = stats.weeklyStreak;
        }

        // Store badge
        CountryBadge memory badge = CountryBadge({
            countryCode: challenge.countryCode,
            countryName: challenge.countryName,
            earnedAt: block.timestamp,
            isGlobalCitizen: stats.countriesCollected >= GLOBAL_CITIZEN_THRESHOLD
        });
        userBadges[user].push(badge);

        emit BadgeEarned(weekId, user, challenge.countryCode, challenge.countryName, BADGE_REWARD);

        // Check for Global Citizen achievement
        if (stats.countriesCollected == GLOBAL_CITIZEN_THRESHOLD) {
            require(toursToken.transfer(user, GLOBAL_CITIZEN_BONUS), "Global citizen bonus failed");
            stats.totalRewards += GLOBAL_CITIZEN_BONUS;
            emit GlobalCitizenAchieved(user, stats.countriesCollected, GLOBAL_CITIZEN_BONUS);
        }
    }

    // ========================================================================
    // CHALLENGE FINALIZATION
    // ========================================================================

    function finalizeChallenge(uint256 weekId) external onlyKeeper {
        WeeklyCountryChallenge storage challenge = weeklyChallenges[weekId];
        require(challenge.active, "Already finalized");
        require(block.timestamp > challenge.endTime, "Challenge still active");

        challenge.active = false;
        challenge.finalized = true;

        // Count total completions
        uint256 totalCompletions = 0;
        // Note: Would need to track this separately in a production implementation

        emit WeekFinalized(weekId, totalCompletions);
    }

    // ========================================================================
    // VIEW FUNCTIONS
    // ========================================================================

    function getCurrentChallenge() external view returns (WeeklyCountryChallenge memory) {
        uint256 currentId = _weekIdCounter > 0 ? _weekIdCounter - 1 : 0;
        return weeklyChallenges[currentId];
    }

    function getChallenge(uint256 weekId) external view returns (WeeklyCountryChallenge memory) {
        return weeklyChallenges[weekId];
    }

    function getUserProgress(uint256 weekId, address user) external view returns (UserCountryProgress memory) {
        return userProgress[weekId][user];
    }

    function getCollectorStats(address user) external view returns (CollectorStats memory) {
        return collectorStats[user];
    }

    function getUserBadges(address user) external view returns (CountryBadge[] memory) {
        return userBadges[user];
    }

    function getRandomnessRequest(uint256 weekId) external view returns (RandomnessRequest memory) {
        return randomnessRequests[weekId];
    }

    // ========================================================================
    // ADMIN FUNCTIONS
    // ========================================================================

    function setKeeper(address newKeeper) external onlyOwner {
        require(newKeeper != address(0), "Invalid keeper");
        keeper = newKeeper;
    }

    function setResolver(address newResolver) external onlyOwner {
        require(newResolver != address(0), "Invalid resolver");
        resolver = newResolver;
    }

    function fundRewards(uint256 amount) external {
        require(toursToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");
    }

    function withdrawTours(uint256 amount) external onlyOwner {
        require(toursToken.transfer(owner(), amount), "Transfer failed");
    }

    function getContractBalance() external view returns (uint256) {
        return toursToken.balanceOf(address(this));
    }

    receive() external payable {}
}
