// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title MusicBeatMatch
 * @notice Daily music guessing game - users guess artist/song from 3-second audio snippet, earn TOURS rewards
 * @dev Events trigger ActionBasedDemandSignal recording via backend (not contract-to-contract)
 */
contract MusicBeatMatch is Ownable, ReentrancyGuard {

    // ========================================================================
    // STRUCTURES
    // ========================================================================

    struct DailyChallenge {
        uint256 challengeId;
        uint256 artistId;
        string songTitle;
        string ipfsAudioHash;        // 3-second audio snippet
        uint256 startTime;
        uint256 endTime;             // 24 hours from start
        uint256 correctGuesses;
        uint256 totalGuesses;
        uint256 rewardPool;          // TOURS allocated for this challenge
        bool active;
        bytes32 answerHash;          // keccak256(abi.encodePacked(artistId, songTitle))
    }

    struct UserGuess {
        uint256 challengeId;
        address user;
        uint256 guessedArtistId;
        string guessedSongTitle;
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
        uint256 lastPlayedDay;       // Day number since epoch
        uint256 level;               // 1-10 based on performance
    }

    // ========================================================================
    // STATE
    // ========================================================================

    mapping(uint256 => DailyChallenge) public challenges;
    mapping(uint256 => mapping(address => UserGuess)) public userGuesses;  // challengeId => user => guess
    mapping(address => PlayerStats) public playerStats;
    mapping(uint256 => address[]) public challengePlayers;                 // challengeId => players
    mapping(address => mapping(uint256 => bool)) public hasPlayed;         // user => challengeId => played

    uint256 private _challengeIdCounter;
    IERC20 public toursToken;
    address public keeper;                                                 // Bot that creates challenges

    // Rewards configuration
    uint256 public BASE_REWARD = 10 ether;                                 // 10 TOURS base
    uint256 public STREAK_BONUS_MULTIPLIER = 2;                            // 2x per 7-day streak
    uint256 public PERFECT_SPEED_BONUS = 5 ether;                          // 5 TOURS for fast correct guess
    uint256 public DAILY_POOL = 1000 ether;                                // 1000 TOURS per day

    // Timing
    uint256 public constant CHALLENGE_DURATION = 24 hours;
    uint256 public constant SPEED_THRESHOLD = 5 minutes;                   // Bonus if guessed within 5 min

    // ========================================================================
    // EVENTS (Backend listens to these and records demand signals)
    // ========================================================================

    event ChallengeCreated(
        uint256 indexed challengeId,
        uint256 indexed artistId,
        string songTitle,
        uint256 startTime,
        uint256 rewardPool
    );

    event GuessSubmitted(
        uint256 indexed challengeId,
        address indexed user,
        uint256 indexed artistId,
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
    // DAILY CHALLENGE CREATION (KEEPER/BOT)
    // ========================================================================

    /**
     * @dev Create new daily challenge (called by keeper bot daily)
     */
    function createDailyChallenge(
        uint256 artistId,
        string memory songTitle,
        string memory ipfsAudioHash
    ) external onlyKeeper returns (uint256) {

        uint256 challengeId = _challengeIdCounter++;
        bytes32 answerHash = keccak256(abi.encodePacked(artistId, songTitle));

        DailyChallenge storage challenge = challenges[challengeId];
        challenge.challengeId = challengeId;
        challenge.artistId = artistId;
        challenge.songTitle = songTitle;
        challenge.ipfsAudioHash = ipfsAudioHash;
        challenge.startTime = block.timestamp;
        challenge.endTime = block.timestamp + CHALLENGE_DURATION;
        challenge.rewardPool = DAILY_POOL;
        challenge.active = true;
        challenge.answerHash = answerHash;

        emit ChallengeCreated(challengeId, artistId, songTitle, block.timestamp, DAILY_POOL);

        return challengeId;
    }

    // ========================================================================
    // GAMEPLAY
    // ========================================================================

    /**
     * @dev Submit guess for daily challenge
     */
    function submitGuess(
        uint256 challengeId,
        uint256 guessedArtistId,
        string memory guessedSongTitle
    ) external nonReentrant {

        DailyChallenge storage challenge = challenges[challengeId];
        require(challenge.active, "Challenge not active");
        require(block.timestamp <= challenge.endTime, "Challenge ended");
        require(!hasPlayed[msg.sender][challengeId], "Already played today");

        // Check if guess is correct
        bytes32 guessHash = keccak256(abi.encodePacked(guessedArtistId, guessedSongTitle));
        bool correct = (guessHash == challenge.answerHash);

        // Calculate reward
        uint256 reward = 0;
        if (correct) {
            reward = _calculateReward(msg.sender, challengeId, challenge.startTime);
            challenge.correctGuesses++;
        }

        challenge.totalGuesses++;

        // Record guess
        UserGuess storage guess = userGuesses[challengeId][msg.sender];
        guess.challengeId = challengeId;
        guess.user = msg.sender;
        guess.guessedArtistId = guessedArtistId;
        guess.guessedSongTitle = guessedSongTitle;
        guess.correct = correct;
        guess.timestamp = block.timestamp;
        guess.rewardEarned = reward;

        // Update player stats
        _updatePlayerStats(msg.sender, correct, reward);

        // Track player
        challengePlayers[challengeId].push(msg.sender);
        hasPlayed[msg.sender][challengeId] = true;

        // Distribute reward if correct
        if (correct && reward > 0) {
            require(toursToken.transfer(msg.sender, reward), "Reward transfer failed");
        }

        // Backend listens to this event and records MUSIC_PURCHASE demand signal
        emit GuessSubmitted(challengeId, msg.sender, challenge.artistId, correct, reward);
    }

    /**
     * @dev Calculate reward based on speed, streak, and performance
     */
    function _calculateReward(
        address user,
        uint256 challengeId,
        uint256 challengeStartTime
    ) internal view returns (uint256) {

        PlayerStats storage stats = playerStats[user];
        uint256 reward = BASE_REWARD;

        // Speed bonus (if guessed within 5 minutes)
        if (block.timestamp <= challengeStartTime + SPEED_THRESHOLD) {
            reward += PERFECT_SPEED_BONUS;
        }

        // Streak bonus (2x for every 7-day streak)
        uint256 streakWeeks = stats.currentStreak / 7;
        if (streakWeeks > 0) {
            reward = reward * (1 + (streakWeeks * STREAK_BONUS_MULTIPLIER));
        }

        // Level bonus (10% per level) - treat 0 as level 1 for first-time players
        uint256 playerLevel = stats.level > 0 ? stats.level : 1;
        uint256 levelBonus = (reward * playerLevel * 10) / 100;
        reward += levelBonus;

        return reward;
    }

    /**
     * @dev Update player stats after guess
     */
    function _updatePlayerStats(address user, bool correct, uint256 reward) internal {
        PlayerStats storage stats = playerStats[user];

        // Initialize level on first guess
        if (stats.totalGuesses == 0) {
            stats.level = 1;
        }

        stats.totalGuesses++;

        if (correct) {
            stats.correctGuesses++;
            stats.totalRewards += reward;

            // Update streak
            uint256 currentDay = block.timestamp / 1 days;
            if (currentDay > 0 && stats.lastPlayedDay == currentDay - 1) {
                // Consecutive day
                stats.currentStreak++;
            } else if (currentDay > 0 && stats.lastPlayedDay < currentDay - 1) {
                // Streak broken (skipped days)
                stats.currentStreak = 1;
            } else if (stats.lastPlayedDay == 0) {
                // First time playing
                stats.currentStreak = 1;
            }
            // If lastPlayedDay == currentDay or other edge cases, keep streak as is

            stats.lastPlayedDay = currentDay;

            // Update longest streak
            if (stats.currentStreak > stats.longestStreak) {
                stats.longestStreak = stats.currentStreak;
            }

            // Emit streak achievement
            if (stats.currentStreak % 7 == 0) {
                emit StreakAchieved(user, stats.currentStreak, stats.currentStreak / 7);
            }

            // Update level (1-10 based on accuracy) - only after 3+ guesses for meaningful data
            if (stats.totalGuesses >= 3) {
                uint256 accuracy = (stats.correctGuesses * 100) / stats.totalGuesses;
                stats.level = (accuracy / 10) + 1;  // 90%+ = level 10
                if (stats.level > 10) stats.level = 10;
            }
        } else {
            // Wrong guess - reset streak
            stats.currentStreak = 0;
        }
    }

    // ========================================================================
    // CHALLENGE FINALIZATION (KEEPER)
    // ========================================================================

    /**
     * @dev Finalize challenge and reveal answer (called by keeper after 24h)
     */
    function finalizeChallenge(uint256 challengeId) external onlyKeeper {
        DailyChallenge storage challenge = challenges[challengeId];
        require(challenge.active, "Already finalized");
        require(block.timestamp > challenge.endTime, "Challenge still active");

        challenge.active = false;

        // Calculate total rewards distributed
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

    /**
     * @dev Get current active challenge
     */
    function getCurrentChallenge() external view returns (DailyChallenge memory) {
        uint256 currentId = _challengeIdCounter > 0 ? _challengeIdCounter - 1 : 0;
        return challenges[currentId];
    }

    /**
     * @dev Get challenge by ID
     */
    function getChallenge(uint256 challengeId) external view returns (DailyChallenge memory) {
        return challenges[challengeId];
    }

    /**
     * @dev Get player stats
     */
    function getPlayerStats(address user) external view returns (PlayerStats memory) {
        return playerStats[user];
    }

    /**
     * @dev Get user's guess for challenge
     */
    function getUserGuess(uint256 challengeId, address user)
        external
        view
        returns (UserGuess memory)
    {
        return userGuesses[challengeId][user];
    }

    /**
     * @dev Get all players for challenge
     */
    function getChallengePlayers(uint256 challengeId)
        external
        view
        returns (address[] memory)
    {
        return challengePlayers[challengeId];
    }

    /**
     * @dev Get challenge statistics
     */
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

    /**
     * @dev Update keeper address
     */
    function setKeeper(address newKeeper) external onlyOwner {
        require(newKeeper != address(0), "Invalid keeper");
        keeper = newKeeper;
    }

    /**
     * @dev Update reward configuration
     */
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
