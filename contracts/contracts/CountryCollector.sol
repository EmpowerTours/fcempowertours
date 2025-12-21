// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title CountryCollector
 * @notice Weekly country-themed music discovery game - collect country badges, earn TOURS
 * @dev Integrates with PassportNFT to give bonuses for countries users have passports for
 */
contract CountryCollector is Ownable, ReentrancyGuard {

    // ========================================================================
    // STRUCTURES
    // ========================================================================

    struct WeeklyCountryChallenge {
        uint256 weekId;
        string country;              // "Mexico", "Japan", "Brazil", etc.
        string countryCode;          // "MX", "JP", "BR" (ISO 3166-1 alpha-2)
        uint256 startTime;
        uint256 endTime;             // 7 days from start
        uint256[3] artistIds;        // 3 artists from this country
        uint256 totalCompletions;
        uint256 rewardPool;
        bool active;
    }

    struct UserCountryProgress {
        uint256 weekId;
        address user;
        bool[3] artistsCompleted;    // Listened & verified each artist
        bool badgeEarned;            // Completed all 3
        uint256 completedAt;
        uint256 rewardEarned;
    }

    struct CountryBadge {
        string country;
        string countryCode;
        uint256 earnedAt;
        uint256 weekId;
        bool fromPassport;           // Did user have passport for this country?
    }

    struct CollectorStats {
        uint256 totalBadges;
        uint256 totalRewards;
        uint256 currentStreak;       // Consecutive weeks
        uint256 longestStreak;
        uint256 passportMatchBadges; // Badges from countries with passport
        uint256 globalCitizenProgress; // Out of 50 countries
    }

    // ========================================================================
    // STATE
    // ========================================================================

    mapping(uint256 => WeeklyCountryChallenge) public weeklyChallenges;
    mapping(uint256 => mapping(address => UserCountryProgress)) public userProgress; // weekId => user => progress
    mapping(address => CountryBadge[]) public userBadges;
    mapping(address => mapping(string => bool)) public hasBadgeForCountry; // user => countryCode => earned
    mapping(address => CollectorStats) public collectorStats;

    uint256 private _weekIdCounter;
    IERC20 public toursToken;
    address public passportContract;     // PassportNFTv3 for bonus checks
    address public keeper;

    // Rewards configuration
    uint256 public COUNTRY_COMPLETION_REWARD = 20 ether;         // 20 TOURS per country
    uint256 public PASSPORT_MATCH_BONUS = 10 ether;              // +10 if you have passport
    uint256 public WEEKLY_STREAK_BONUS = 15 ether;               // +15 for 3-week streak
    uint256 public PASSPORT_MASTER_REWARD = 100 ether;           // Complete all passport countries
    uint256 public GLOBAL_CITIZEN_REWARD = 500 ether;            // Collect all 50 countries
    uint256 public DISCOVERY_BONUS = 5 ether;                    // +5 per new artist listened

    uint256 public constant TOTAL_COUNTRIES = 50;                // Target for Global Citizen
    uint256 public constant WEEK_DURATION = 7 days;

    // ========================================================================
    // EVENTS
    // ========================================================================

    event WeeklyChallengeCreated(
        uint256 indexed weekId,
        string country,
        string countryCode,
        uint256[3] artistIds,
        uint256 startTime
    );

    event ArtistCompleted(
        uint256 indexed weekId,
        address indexed user,
        string country,
        uint256 artistId,
        uint256 artistIndex
    );

    event CountryBadgeEarned(
        uint256 indexed weekId,
        address indexed user,
        string country,
        string countryCode,
        bool fromPassport,
        uint256 rewardEarned
    );

    event StreakAchieved(
        address indexed user,
        uint256 streakWeeks,
        uint256 bonusEarned
    );

    event MilestoneReached(
        address indexed user,
        string milestoneType,
        uint256 progress,
        uint256 rewardEarned
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
        address _passportContract,
        address _keeper
    ) Ownable(msg.sender) {
        require(_toursToken != address(0), "Invalid TOURS token");
        require(_keeper != address(0), "Invalid keeper");
        toursToken = IERC20(_toursToken);
        passportContract = _passportContract;
        keeper = _keeper;
    }

    // ========================================================================
    // WEEKLY CHALLENGE CREATION (KEEPER)
    // ========================================================================

    /**
     * @dev Create new weekly country challenge
     * @param country Full country name ("Mexico", "Japan", etc.)
     * @param countryCode ISO 3166-1 alpha-2 code ("MX", "JP", etc.)
     * @param artistIds Array of 3 artist IDs from this country
     */
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
        challenge.weekId = weekId;
        challenge.country = country;
        challenge.countryCode = countryCode;
        challenge.startTime = block.timestamp;
        challenge.endTime = block.timestamp + WEEK_DURATION;
        challenge.artistIds = artistIds;
        challenge.rewardPool = COUNTRY_COMPLETION_REWARD;
        challenge.active = true;

        emit WeeklyChallengeCreated(weekId, country, countryCode, artistIds, block.timestamp);

        return weekId;
    }

    // ========================================================================
    // GAMEPLAY
    // ========================================================================

    /**
     * @dev Mark artist as completed (user listened to song and verified it's from country)
     * @param weekId The weekly challenge ID
     * @param artistIndex Index of artist (0, 1, or 2)
     * @param artistId The artist ID (for verification)
     */
    function completeArtist(
        uint256 weekId,
        uint256 artistIndex,
        uint256 artistId
    ) external nonReentrant {

        WeeklyCountryChallenge storage challenge = weeklyChallenges[weekId];
        require(challenge.active, "Challenge not active");
        require(block.timestamp <= challenge.endTime, "Challenge ended");
        require(artistIndex < 3, "Invalid artist index");
        require(challenge.artistIds[artistIndex] == artistId, "Artist ID mismatch");

        UserCountryProgress storage progress = userProgress[weekId][msg.sender];
        require(!progress.artistsCompleted[artistIndex], "Artist already completed");

        // Mark artist as completed
        progress.weekId = weekId;
        progress.user = msg.sender;
        progress.artistsCompleted[artistIndex] = true;

        // Award discovery bonus
        require(toursToken.transfer(msg.sender, DISCOVERY_BONUS), "Discovery bonus failed");

        emit ArtistCompleted(weekId, msg.sender, challenge.country, artistId, artistIndex);

        // Check if all 3 artists completed
        if (progress.artistsCompleted[0] && progress.artistsCompleted[1] && progress.artistsCompleted[2]) {
            _awardCountryBadge(weekId, msg.sender);
        }
    }

    /**
     * @dev Internal function to award country badge
     */
    function _awardCountryBadge(uint256 weekId, address user) internal {
        WeeklyCountryChallenge storage challenge = weeklyChallenges[weekId];
        UserCountryProgress storage progress = userProgress[weekId][user];

        require(!progress.badgeEarned, "Badge already earned");

        // Check if user has passport for this country
        bool hasPassport = _checkPassportForCountry(user, challenge.countryCode);

        // Calculate reward
        uint256 reward = COUNTRY_COMPLETION_REWARD;
        if (hasPassport) {
            reward += PASSPORT_MATCH_BONUS;
        }

        // Create badge
        CountryBadge memory badge = CountryBadge({
            country: challenge.country,
            countryCode: challenge.countryCode,
            earnedAt: block.timestamp,
            weekId: weekId,
            fromPassport: hasPassport
        });

        userBadges[user].push(badge);
        hasBadgeForCountry[user][challenge.countryCode] = true;
        progress.badgeEarned = true;
        progress.completedAt = block.timestamp;
        progress.rewardEarned = reward;

        // Update stats
        CollectorStats storage stats = collectorStats[user];
        stats.totalBadges++;
        stats.totalRewards += reward;
        stats.globalCitizenProgress = stats.totalBadges; // Simplified: each badge = 1 country

        if (hasPassport) {
            stats.passportMatchBadges++;
        }

        // Update streak
        _updateStreak(user, weekId);

        // Update challenge stats
        challenge.totalCompletions++;

        // Transfer reward
        require(toursToken.transfer(user, reward), "Reward transfer failed");

        emit CountryBadgeEarned(weekId, user, challenge.country, challenge.countryCode, hasPassport, reward);

        // Check for milestones
        _checkMilestones(user);
    }

    /**
     * @dev Update user's streak
     */
    function _updateStreak(address user, uint256 weekId) internal {
        CollectorStats storage stats = collectorStats[user];

        // Check if completed previous week
        if (weekId > 0) {
            UserCountryProgress storage prevProgress = userProgress[weekId - 1][user];
            if (prevProgress.badgeEarned) {
                stats.currentStreak++;
            } else {
                stats.currentStreak = 1;
            }
        } else {
            stats.currentStreak = 1;
        }

        // Update longest streak
        if (stats.currentStreak > stats.longestStreak) {
            stats.longestStreak = stats.currentStreak;
        }

        // Streak bonus every 3 weeks
        if (stats.currentStreak > 0 && stats.currentStreak % 3 == 0) {
            require(toursToken.transfer(user, WEEKLY_STREAK_BONUS), "Streak bonus failed");
            emit StreakAchieved(user, stats.currentStreak, WEEKLY_STREAK_BONUS);
        }
    }

    /**
     * @dev Check if user has passport for country
     * @dev This calls PassportNFTv3.hasPassport(address user, string country)
     */
    function _checkPassportForCountry(address user, string memory countryCode) internal view returns (bool) {
        if (passportContract == address(0)) {
            return false;
        }

        // Call PassportNFTv3.hasPassport(address, string)
        (bool success, bytes memory data) = passportContract.staticcall(
            abi.encodeWithSignature("hasPassport(address,string)", user, countryCode)
        );

        if (success && data.length > 0) {
            return abi.decode(data, (bool));
        }

        return false;
    }

    /**
     * @dev Check for milestone achievements
     */
    function _checkMilestones(address user) internal {
        CollectorStats storage stats = collectorStats[user];

        // Passport Master: Collected badges for all passport countries
        // Simplified: Award when user has 10+ passport-match badges
        if (stats.passportMatchBadges >= 10 && stats.passportMatchBadges % 10 == 0) {
            require(toursToken.transfer(user, PASSPORT_MASTER_REWARD), "Passport Master reward failed");
            emit MilestoneReached(user, "PASSPORT_MASTER", stats.passportMatchBadges, PASSPORT_MASTER_REWARD);
        }

        // Global Citizen: Collected all 50 countries
        if (stats.globalCitizenProgress >= TOTAL_COUNTRIES && stats.globalCitizenProgress == TOTAL_COUNTRIES) {
            require(toursToken.transfer(user, GLOBAL_CITIZEN_REWARD), "Global Citizen reward failed");
            emit MilestoneReached(user, "GLOBAL_CITIZEN", TOTAL_COUNTRIES, GLOBAL_CITIZEN_REWARD);
        }
    }

    // ========================================================================
    // CHALLENGE MANAGEMENT (KEEPER)
    // ========================================================================

    /**
     * @dev Finalize weekly challenge (called after week ends)
     */
    function finalizeChallenge(uint256 weekId) external onlyKeeper {
        WeeklyCountryChallenge storage challenge = weeklyChallenges[weekId];
        require(challenge.active, "Already finalized");
        require(block.timestamp > challenge.endTime, "Challenge still active");

        challenge.active = false;
    }

    // ========================================================================
    // VIEW FUNCTIONS
    // ========================================================================

    /**
     * @dev Get current active challenge
     */
    function getCurrentChallenge() external view returns (WeeklyCountryChallenge memory) {
        uint256 currentId = _weekIdCounter > 0 ? _weekIdCounter - 1 : 0;
        return weeklyChallenges[currentId];
    }

    /**
     * @dev Get challenge by week ID
     */
    function getChallenge(uint256 weekId) external view returns (WeeklyCountryChallenge memory) {
        return weeklyChallenges[weekId];
    }

    /**
     * @dev Get user's progress for week
     */
    function getUserProgress(uint256 weekId, address user)
        external
        view
        returns (UserCountryProgress memory)
    {
        return userProgress[weekId][user];
    }

    /**
     * @dev Get all badges earned by user
     */
    function getUserBadges(address user) external view returns (CountryBadge[] memory) {
        return userBadges[user];
    }

    /**
     * @dev Get user's collector stats
     */
    function getCollectorStats(address user) external view returns (CollectorStats memory) {
        return collectorStats[user];
    }

    /**
     * @dev Check if user has badge for country
     */
    function hasCountryBadge(address user, string memory countryCode) external view returns (bool) {
        return hasBadgeForCountry[user][countryCode];
    }

    /**
     * @dev Get user's collection progress
     */
    function getCollectionProgress(address user)
        external
        view
        returns (
            uint256 totalBadges,
            uint256 passportMatchBadges,
            uint256 currentStreak,
            uint256 progressToGlobalCitizen
        )
    {
        CollectorStats memory stats = collectorStats[user];
        return (
            stats.totalBadges,
            stats.passportMatchBadges,
            stats.currentStreak,
            (stats.globalCitizenProgress * 100) / TOTAL_COUNTRIES // Percentage
        );
    }

    // ========================================================================
    // ADMIN FUNCTIONS
    // ========================================================================

    /**
     * @dev Update keeper address
     */
    function setKeeper(address newKeeper) external onlyOwner {
        require(newKeeper != address(0), "Invalid keeper");
        keeper = newKeeper;
    }

    /**
     * @dev Update passport contract
     */
    function setPassportContract(address _passportContract) external onlyOwner {
        passportContract = _passportContract;
    }

    /**
     * @dev Update reward configuration
     */
    function updateRewardConfig(
        uint256 countryReward,
        uint256 passportBonus,
        uint256 streakBonus,
        uint256 passportMasterReward,
        uint256 globalCitizenReward,
        uint256 discoveryBonus
    ) external onlyOwner {
        COUNTRY_COMPLETION_REWARD = countryReward;
        PASSPORT_MATCH_BONUS = passportBonus;
        WEEKLY_STREAK_BONUS = streakBonus;
        PASSPORT_MASTER_REWARD = passportMasterReward;
        GLOBAL_CITIZEN_REWARD = globalCitizenReward;
        DISCOVERY_BONUS = discoveryBonus;
    }

    /**
     * @dev Fund contract with TOURS for rewards
     */
    function fundRewards(uint256 amount) external {
        require(toursToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");
    }

    /**
     * @dev Withdraw TOURS (only owner)
     */
    function withdrawTours(uint256 amount) external onlyOwner {
        require(toursToken.transfer(owner(), amount), "Transfer failed");
    }

    /**
     * @dev Get contract TOURS balance
     */
    function getContractBalance() external view returns (uint256) {
        return toursToken.balanceOf(address(this));
    }

    receive() external payable {}
}
