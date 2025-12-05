// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title MusicBeatMatchV2
 * @notice V2 with delegation support - Platform Safe can submit guesses on behalf of users
 * @dev Adds beneficiary parameter to support gasless gameplay via Account Abstraction
 */
contract MusicBeatMatchV2 is Ownable, ReentrancyGuard {

    // ========================================================================
    // STRUCTURES
    // ========================================================================

    struct DailyChallenge {
        uint256 challengeId;
        uint256 artistId;
        string songTitle;
        string artistUsername;       // ✨ NEW: Farcaster username
        string ipfsAudioHash;
        uint256 startTime;
        uint256 endTime;
        uint256 correctGuesses;
        uint256 totalGuesses;
        uint256 rewardPool;
        bool active;
        bytes32 answerHash;
    }

    struct UserGuess {
        uint256 challengeId;
        address user;
        uint256 guessedArtistId;
        string guessedSongTitle;
        string guessedUsername;      // ✨ NEW: Guessed Farcaster username
        bool correct;
        uint256 timestamp;
        uint256 rewardEarned;
    }

    struct PlayerStats {
        uint256 totalGuesses;
        uint256 correctGuesses;
        uint256 currentStreak;
        uint256 longestStreak;
        uint256 totalRewards;
        uint256 lastPlayedDay;
        uint256 level;
    }

    // ========================================================================
    // STATE
    // ========================================================================

    mapping(uint256 => DailyChallenge) public challenges;
    mapping(uint256 => mapping(address => UserGuess)) public userGuesses;
    mapping(address => PlayerStats) public playerStats;
    mapping(uint256 => address[]) public challengePlayers;
    mapping(address => mapping(uint256 => bool)) public hasPlayed;

    uint256 private _challengeIdCounter;
    IERC20 public toursToken;
    address public keeper;

    // Rewards configuration
    uint256 public BASE_REWARD = 10 ether;
    uint256 public STREAK_BONUS_MULTIPLIER = 2;
    uint256 public PERFECT_SPEED_BONUS = 5 ether;
    uint256 public DAILY_POOL = 1000 ether;

    // Timing
    uint256 public constant CHALLENGE_DURATION = 24 hours;
    uint256 public constant SPEED_THRESHOLD = 5 minutes;

    // ========================================================================
    // EVENTS
    // ========================================================================

    event ChallengeCreated(
        uint256 indexed challengeId,
        uint256 indexed artistId,
        string songTitle,
        string artistUsername,       // ✨ NEW
        uint256 startTime,
        uint256 rewardPool
    );

    event GuessSubmitted(
        uint256 indexed challengeId,
        address indexed user,
        uint256 indexed artistId,
        string artistUsername,       // ✨ NEW
        bool correct,
        uint256 rewardEarned
    );

    event StreakAchieved(
        address indexed user,
        uint256 streakDays,
        uint256 bonusMultiplier
    );

    event RewardsDistributed(
        uint256 indexed challengeId,
        uint256 totalDistributed,
        uint256 winnersCount
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

    /**
     * @dev Create new daily challenge with Farcaster username support
     */
    function createDailyChallenge(
        uint256 artistId,
        string memory songTitle,
        string memory artistUsername,    // ✨ NEW: Farcaster username
        string memory ipfsAudioHash
    ) external onlyKeeper returns (uint256) {

        uint256 challengeId = _challengeIdCounter++;

        // Create answer hash that accepts either artist ID OR username
        // Users can guess using either method
        bytes32 answerHashById = keccak256(abi.encodePacked(artistId, songTitle));
        bytes32 answerHashByUsername = keccak256(abi.encodePacked(artistUsername, songTitle));

        DailyChallenge storage challenge = challenges[challengeId];
        challenge.challengeId = challengeId;
        challenge.artistId = artistId;
        challenge.songTitle = songTitle;
        challenge.artistUsername = artistUsername;
        challenge.ipfsAudioHash = ipfsAudioHash;
        challenge.startTime = block.timestamp;
        challenge.endTime = block.timestamp + CHALLENGE_DURATION;
        challenge.rewardPool = DAILY_POOL;
        challenge.active = true;
        challenge.answerHash = answerHashById; // Store ID-based hash

        emit ChallengeCreated(challengeId, artistId, songTitle, artistUsername, block.timestamp, DAILY_POOL);

        return challengeId;
    }

    // ========================================================================
    // GAMEPLAY - V2 WITH DELEGATION SUPPORT
    // ========================================================================

    /**
     * @dev Submit guess on behalf of a user (delegation support)
     * @param beneficiary The user who is playing (gets rewards/stats)
     * @param challengeId The challenge ID
     * @param guessedArtistId Artist ID guess (optional if username provided)
     * @param guessedSongTitle Song title guess
     * @param guessedUsername Farcaster username guess (optional if artist ID provided)
     */
    function submitGuessFor(
        address beneficiary,              // ✨ NEW: Delegation support!
        uint256 challengeId,
        uint256 guessedArtistId,
        string memory guessedSongTitle,
        string memory guessedUsername     // ✨ NEW: Username support!
    ) external nonReentrant {

        DailyChallenge storage challenge = challenges[challengeId];
        require(challenge.active, "Challenge not active");
        require(block.timestamp <= challenge.endTime, "Challenge ended");
        require(!hasPlayed[beneficiary][challengeId], "Already played today");

        // Check if guess is correct using EITHER artist ID OR username
        bytes32 guessHashById = keccak256(abi.encodePacked(guessedArtistId, guessedSongTitle));
        bytes32 guessHashByUsername = keccak256(abi.encodePacked(guessedUsername, guessedSongTitle));

        bool correct = (guessHashById == challenge.answerHash) ||
                      (guessHashByUsername == keccak256(abi.encodePacked(challenge.artistUsername, challenge.songTitle)));

        // Calculate reward
        uint256 reward = 0;
        if (correct) {
            reward = _calculateReward(beneficiary, challengeId, challenge.startTime);
            challenge.correctGuesses++;
        }

        challenge.totalGuesses++;

        // Record guess (using beneficiary, not msg.sender!)
        UserGuess storage guess = userGuesses[challengeId][beneficiary];
        guess.challengeId = challengeId;
        guess.user = beneficiary;
        guess.guessedArtistId = guessedArtistId;
        guess.guessedSongTitle = guessedSongTitle;
        guess.guessedUsername = guessedUsername;
        guess.correct = correct;
        guess.timestamp = block.timestamp;
        guess.rewardEarned = reward;

        // Update player stats (for beneficiary!)
        _updatePlayerStats(beneficiary, correct, reward);

        // Track player
        challengePlayers[challengeId].push(beneficiary);
        hasPlayed[beneficiary][challengeId] = true;

        // Distribute reward if correct (to beneficiary!)
        if (correct && reward > 0) {
            require(toursToken.transfer(beneficiary, reward), "Reward transfer failed");
        }

        emit GuessSubmitted(challengeId, beneficiary, challenge.artistId, challenge.artistUsername, correct, reward);
    }

    /**
     * @dev Legacy function for backwards compatibility (users pay their own gas)
     */
    function submitGuess(
        uint256 challengeId,
        uint256 guessedArtistId,
        string memory guessedSongTitle
    ) external nonReentrant {
        submitGuessFor(msg.sender, challengeId, guessedArtistId, guessedSongTitle, "");
    }

    // ========================================================================
    // INTERNAL FUNCTIONS (Same as V1)
    // ========================================================================

    function _calculateReward(
        address user,
        uint256 challengeId,
        uint256 challengeStartTime
    ) internal view returns (uint256) {

        PlayerStats storage stats = playerStats[user];
        uint256 reward = BASE_REWARD;

        // Speed bonus
        if (block.timestamp <= challengeStartTime + SPEED_THRESHOLD) {
            reward += PERFECT_SPEED_BONUS;
        }

        // Streak bonus
        uint256 streakWeeks = stats.currentStreak / 7;
        if (streakWeeks > 0) {
            reward = reward * (1 + (streakWeeks * STREAK_BONUS_MULTIPLIER));
        }

        // Level bonus
        uint256 playerLevel = stats.level > 0 ? stats.level : 1;
        uint256 levelBonus = (reward * playerLevel * 10) / 100;
        reward += levelBonus;

        return reward;
    }

    function _updatePlayerStats(address user, bool correct, uint256 reward) internal {
        PlayerStats storage stats = playerStats[user];

        if (stats.totalGuesses == 0) {
            stats.level = 1;
        }

        stats.totalGuesses++;

        if (correct) {
            stats.correctGuesses++;
            stats.totalRewards += reward;

            uint256 currentDay = block.timestamp / 1 days;
            if (currentDay > 0 && stats.lastPlayedDay == currentDay - 1) {
                stats.currentStreak++;
            } else if (currentDay > 0 && stats.lastPlayedDay < currentDay - 1) {
                stats.currentStreak = 1;
            } else if (stats.lastPlayedDay == 0) {
                stats.currentStreak = 1;
            }

            stats.lastPlayedDay = currentDay;

            if (stats.currentStreak > stats.longestStreak) {
                stats.longestStreak = stats.currentStreak;
            }

            if (stats.currentStreak % 7 == 0) {
                emit StreakAchieved(user, stats.currentStreak, stats.currentStreak / 7);
            }

            if (stats.totalGuesses >= 3) {
                uint256 accuracy = (stats.correctGuesses * 100) / stats.totalGuesses;
                stats.level = (accuracy / 10) + 1;
                if (stats.level > 10) stats.level = 10;
            }
        } else {
            stats.currentStreak = 0;
        }
    }

    // ========================================================================
    // CHALLENGE FINALIZATION
    // ========================================================================

    function finalizeChallenge(uint256 challengeId) external onlyKeeper {
        DailyChallenge storage challenge = challenges[challengeId];
        require(challenge.active, "Already finalized");
        require(block.timestamp > challenge.endTime, "Challenge still active");

        challenge.active = false;

        uint256 totalDistributed = 0;
        address[] memory players = challengePlayers[challengeId];

        for (uint256 i = 0; i < players.length; i++) {
            UserGuess storage guess = userGuesses[challengeId][players[i]];
            if (guess.correct) {
                totalDistributed += guess.rewardEarned;
            }
        }

        emit RewardsDistributed(challengeId, totalDistributed, challenge.correctGuesses);
    }

    // ========================================================================
    // VIEW FUNCTIONS
    // ========================================================================

    function getCurrentChallenge() external view returns (DailyChallenge memory) {
        uint256 currentId = _challengeIdCounter > 0 ? _challengeIdCounter - 1 : 0;
        return challenges[currentId];
    }

    function getChallenge(uint256 challengeId) external view returns (DailyChallenge memory) {
        return challenges[challengeId];
    }

    function getPlayerStats(address user) external view returns (PlayerStats memory) {
        return playerStats[user];
    }

    function getUserGuess(uint256 challengeId, address user)
        external
        view
        returns (UserGuess memory)
    {
        return userGuesses[challengeId][user];
    }

    function getChallengePlayers(uint256 challengeId)
        external
        view
        returns (address[] memory)
    {
        return challengePlayers[challengeId];
    }

    function getChallengeStats(uint256 challengeId)
        external
        view
        returns (
            uint256 totalPlayers,
            uint256 correctGuesses,
            uint256 accuracy,
            uint256 timeRemaining
        )
    {
        DailyChallenge storage challenge = challenges[challengeId];
        totalPlayers = challengePlayers[challengeId].length;
        correctGuesses = challenge.correctGuesses;

        accuracy = totalPlayers > 0
            ? (correctGuesses * 100) / totalPlayers
            : 0;

        timeRemaining = block.timestamp < challenge.endTime
            ? challenge.endTime - block.timestamp
            : 0;
    }

    // ========================================================================
    // ADMIN FUNCTIONS
    // ========================================================================

    function setKeeper(address newKeeper) external onlyOwner {
        require(newKeeper != address(0), "Invalid keeper");
        keeper = newKeeper;
    }

    function updateRewardConfig(
        uint256 baseReward,
        uint256 streakBonusMultiplier,
        uint256 speedBonus,
        uint256 dailyPool
    ) external onlyOwner {
        BASE_REWARD = baseReward;
        STREAK_BONUS_MULTIPLIER = streakBonusMultiplier;
        PERFECT_SPEED_BONUS = speedBonus;
        DAILY_POOL = dailyPool;
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
