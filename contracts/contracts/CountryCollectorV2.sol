// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title CountryCollectorV2
 * @notice V2 with delegation support - Platform Safe can complete artists on behalf of users
 * @dev Adds beneficiary parameter to support gasless gameplay via Account Abstraction
 */
contract CountryCollectorV2 is Ownable, ReentrancyGuard {

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

    // ========================================================================
    // STATE
    // ========================================================================

    mapping(uint256 => WeeklyCountryChallenge) public weeklyChallenges;
    mapping(uint256 => mapping(address => UserCountryProgress)) public userProgress;
    mapping(address => CollectorStats) public collectorStats;
    mapping(address => CountryBadge[]) public userBadges;

    uint256 private _weekIdCounter;
    IERC20 public toursToken;
    address public keeper;

    // Rewards
    uint256 public constant ARTIST_COMPLETION_REWARD = 5 ether;
    uint256 public constant BADGE_REWARD = 50 ether;
    uint256 public constant GLOBAL_CITIZEN_BONUS = 100 ether;
    uint256 public constant GLOBAL_CITIZEN_THRESHOLD = 10;

    // Timing
    uint256 public constant CHALLENGE_DURATION = 7 days;

    // ========================================================================
    // EVENTS
    // ========================================================================

    event ChallengeCreated(
        uint256 indexed weekId,
        string countryCode,
        string countryName,
        uint256 startTime,
        uint256 rewardPool
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

    // ========================================================================
    // MODIFIERS
    // ========================================================================

    modifier onlyKeeper() {
        require(msg.sender == keeper || msg.sender == owner(), "Not keeper or owner");
        _;
    }

    // ========================================================================
    // CONSTRUCTOR
    // ========================================================================

    constructor(
        address _toursToken,
        address _keeper
    ) Ownable(msg.sender) {
        require(_toursToken != address(0), "Invalid TOURS token");
        require(_keeper != address(0), "Invalid keeper");
        toursToken = IERC20(_toursToken);
        keeper = _keeper;
    }

    // ========================================================================
    // CHALLENGE CREATION
    // ========================================================================

    function createWeeklyChallenge(
        string memory country,
        string memory countryCode,
        uint256[3] memory artistIds
    ) external onlyKeeper returns (uint256 weekId) {

        require(bytes(country).length > 0, "Country required");
        require(bytes(countryCode).length == 2, "Invalid country code");
        require(artistIds[0] > 0 && artistIds[1] > 0 && artistIds[2] > 0, "All artist IDs required");

        weekId = _weekIdCounter++;

        WeeklyCountryChallenge storage challenge = weeklyChallenges[weekId];
        challenge.id = weekId;
        challenge.countryCode = countryCode;
        challenge.countryName = country;
        challenge.artistIds = artistIds;
        challenge.startTime = block.timestamp;
        challenge.endTime = block.timestamp + CHALLENGE_DURATION;
        challenge.rewardPool = BADGE_REWARD + (3 * ARTIST_COMPLETION_REWARD);
        challenge.active = true;

        emit ChallengeCreated(weekId, countryCode, country, block.timestamp, challenge.rewardPool);

        return weekId;
    }

    // ========================================================================
    // GAMEPLAY - V2 WITH DELEGATION SUPPORT
    // ========================================================================

    /**
     * @dev Complete artist on behalf of a user (delegation support)
     * @param beneficiary The user who is collecting (gets rewards/stats)
     * @param weekId The weekly challenge ID
     * @param artistIndex Index of artist (0, 1, or 2)
     * @param artistId The artist ID to verify
     */
    function completeArtistFor(
        address beneficiary,         // ✨ NEW: Delegation support!
        uint256 weekId,
        uint256 artistIndex,
        uint256 artistId
    ) public nonReentrant {

        WeeklyCountryChallenge storage challenge = weeklyChallenges[weekId];
        require(challenge.active, "Challenge not active");
        require(block.timestamp <= challenge.endTime, "Challenge ended");
        require(artistIndex < 3, "Invalid artist index");
        require(challenge.artistIds[artistIndex] == artistId, "Artist ID mismatch");

        UserCountryProgress storage progress = userProgress[weekId][beneficiary];
        require(!progress.artistsCompleted[artistIndex], "Artist already completed");

        // Mark artist as completed (for beneficiary!)
        progress.weekId = weekId;
        progress.user = beneficiary;
        progress.artistsCompleted[artistIndex] = true;
        progress.completedCount++;
        progress.lastCompletedAt = block.timestamp;

        // Award discovery bonus (to beneficiary!)
        require(toursToken.transfer(beneficiary, ARTIST_COMPLETION_REWARD), "Reward transfer failed");

        // Update stats (for beneficiary!)
        CollectorStats storage stats = collectorStats[beneficiary];
        stats.artistsCompleted++;
        stats.totalRewards += ARTIST_COMPLETION_REWARD;

        emit ArtistCompleted(weekId, beneficiary, artistIndex, artistId, ARTIST_COMPLETION_REWARD);

        // Check if all 3 artists completed
        if (progress.completedCount == 3 && !progress.badgeEarned) {
            _awardBadge(beneficiary, weekId, challenge);
        }
    }

    /**
     * @dev Legacy function for backwards compatibility (users pay own gas)
     */
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

    function getUserProgress(uint256 weekId, address user)
        external
        view
        returns (UserCountryProgress memory)
    {
        return userProgress[weekId][user];
    }

    function getCollectorStats(address user)
        external
        view
        returns (CollectorStats memory)
    {
        return collectorStats[user];
    }

    function getUserBadges(address user)
        external
        view
        returns (CountryBadge[] memory)
    {
        return userBadges[user];
    }

    // ========================================================================
    // ADMIN FUNCTIONS
    // ========================================================================

    function setKeeper(address newKeeper) external onlyOwner {
        require(newKeeper != address(0), "Invalid keeper");
        keeper = newKeeper;
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
