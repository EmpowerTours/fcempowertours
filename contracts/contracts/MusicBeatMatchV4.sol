// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SwitchboardTypes} from "@switchboard-xyz/on-demand-solidity/libraries/SwitchboardTypes.sol";
import {ISwitchboard} from "@switchboard-xyz/on-demand-solidity/interfaces/ISwitchboard.sol";

/**
 * @title MusicBeatMatchV4
 * @notice V3 with Switchboard verifiable randomness for fair song selection
 * @dev Uses Switchboard oracles to randomly select music NFTs from Envio-indexed pool
 */
contract MusicBeatMatchV4 is Ownable, ReentrancyGuard {

    // ========================================================================
    // STRUCTURES
    // ========================================================================

    struct DailyChallenge {
        uint256 challengeId;
        uint256 musicNFTTokenId;      // The randomly selected NFT
        uint256 artistId;
        string songTitle;
        string artistUsername;
        string ipfsAudioHash;
        uint256 startTime;
        uint256 endTime;
        uint256 correctGuesses;
        uint256 totalGuesses;
        uint256 rewardPool;
        bool active;
        bool randomnessRequested;
        bool randomnessFulfilled;
        bytes32 answerHash;
    }

    struct UserGuess {
        uint256 challengeId;
        address user;
        uint256 guessedArtistId;
        string guessedSongTitle;
        string guessedUsername;
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

    struct RandomnessRequest {
        uint256 challengeId;
        bytes32 randomnessId;
        uint256 requestedAt;
        bool fulfilled;
    }

    // ========================================================================
    // STATE
    // ========================================================================

    ISwitchboard public switchboard;

    mapping(uint256 => DailyChallenge) public challenges;
    mapping(uint256 => mapping(address => UserGuess)) public userGuesses;
    mapping(address => PlayerStats) public playerStats;
    mapping(uint256 => address[]) public challengePlayers;
    mapping(address => mapping(uint256 => bool)) public hasPlayed;
    mapping(uint256 => RandomnessRequest) public randomnessRequests;

    uint256 private _challengeIdCounter;
    uint256 private _randomnessRequestCounter;
    IERC20 public toursToken;
    address public keeper;
    address public resolver; // Bot that resolves randomness

    // Switchboard Queues
    bytes32 private constant TESTNET_QUEUE = 0xc9477bfb5ff1012859f336cf98725680e7705ba2abece17188cfb28ca66ca5b0;
    bytes32 private constant MAINNET_QUEUE = 0x86807068432f186a147cf0b13a30067d386204ea9d6c8b04743ac2ef010b0752;
    bytes32 public immutable queue;

    // Rewards configuration
    uint256 public BASE_REWARD = 10 ether;
    uint256 public STREAK_BONUS_MULTIPLIER = 2;
    uint256 public PERFECT_SPEED_BONUS = 5 ether;
    uint256 public DAILY_POOL = 1000 ether;

    // Timing
    uint256 public constant CHALLENGE_DURATION = 24 hours;
    uint256 public constant SPEED_THRESHOLD = 5 minutes;
    uint64 public constant MIN_SETTLEMENT_DELAY = 5; // 5 seconds

    // ========================================================================
    // EVENTS
    // ========================================================================

    event RandomSongRequested(
        uint256 indexed challengeId,
        bytes32 indexed randomnessId,
        uint256 requestedAt,
        address indexed caller
    );

    event ChallengeCreatedWithRandomSong(
        uint256 indexed challengeId,
        uint256 indexed musicNFTTokenId,
        uint256 indexed artistId,
        string songTitle,
        string artistUsername,
        string ipfsAudioHash,
        uint256 randomValue,
        uint256 startTime,
        uint256 rewardPool
    );

    event GuessSubmitted(
        uint256 indexed challengeId,
        address indexed user,
        uint256 indexed artistId,
        string artistUsername,
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

        // Auto-detect: Monad Mainnet = 143, Testnet = 10143
        queue = block.chainid == 143 ? MAINNET_QUEUE : TESTNET_QUEUE;
    }

    // ========================================================================
    // RANDOMNESS REQUEST (Step 1: Keeper/Cron calls this)
    // ========================================================================

    /**
     * @dev Request random song selection from Switchboard
     * @notice Keeper calls this to start a new challenge
     */
    function requestRandomSongSelection() external onlyKeeper returns (uint256 challengeId) {
        challengeId = _challengeIdCounter++;

        // Generate unique randomness ID
        bytes32 randomnessId = keccak256(abi.encodePacked(
            challengeId,
            block.timestamp,
            block.number,
            address(this),
            "MusicBeatMatch"
        ));

        // Step 1: Request randomness from Switchboard (auto-assigns oracle)
        switchboard.createRandomness(
            randomnessId,
            MIN_SETTLEMENT_DELAY
        );

        // Store randomness request
        randomnessRequests[challengeId] = RandomnessRequest({
            challengeId: challengeId,
            randomnessId: randomnessId,
            requestedAt: block.timestamp,
            fulfilled: false
        });

        // Create empty challenge
        challenges[challengeId].challengeId = challengeId;
        challenges[challengeId].randomnessRequested = true;
        challenges[challengeId].startTime = block.timestamp;

        emit RandomSongRequested(challengeId, randomnessId, block.timestamp, msg.sender);

        return challengeId;
    }

    // ========================================================================
    // RANDOMNESS RESOLUTION (Step 2: Bot calls this with Switchboard proof)
    // ========================================================================

    /**
     * @dev Create challenge with randomly selected song
     * @param challengeId The challenge ID
     * @param encodedRandomness Switchboard randomness proof
     * @param musicNFTTokenId The music NFT token ID selected by bot
     * @param artistId Artist ID from NFT metadata
     * @param songTitle Song title from NFT metadata
     * @param artistUsername Artist Farcaster username
     * @param ipfsAudioHash IPFS hash of audio file
     */
    function createChallengeWithRandomSong(
        uint256 challengeId,
        bytes calldata encodedRandomness,
        uint256 musicNFTTokenId,
        uint256 artistId,
        string memory songTitle,
        string memory artistUsername,
        string memory ipfsAudioHash
    ) external onlyResolver nonReentrant {
        RandomnessRequest storage request = randomnessRequests[challengeId];
        require(!request.fulfilled, "Already fulfilled");
        require(request.randomnessId != bytes32(0), "Invalid request");

        DailyChallenge storage challenge = challenges[challengeId];
        require(challenge.randomnessRequested, "Randomness not requested");
        require(!challenge.randomnessFulfilled, "Already fulfilled");

        // Settle randomness with Switchboard
        switchboard.settleRandomness(encodedRandomness);
        SwitchboardTypes.Randomness memory randomness = switchboard.getRandomness(request.randomnessId);

        require(randomness.settledAt != 0, "Randomness not settled");

        // Populate challenge with song details
        challenge.musicNFTTokenId = musicNFTTokenId;
        challenge.artistId = artistId;
        challenge.songTitle = songTitle;
        challenge.artistUsername = artistUsername;
        challenge.ipfsAudioHash = ipfsAudioHash;
        challenge.endTime = challenge.startTime + CHALLENGE_DURATION;
        challenge.rewardPool = DAILY_POOL;
        challenge.active = true;
        challenge.randomnessFulfilled = true;

        // Create answer hash
        challenge.answerHash = keccak256(abi.encodePacked(artistId, songTitle));

        // Mark request as fulfilled
        request.fulfilled = true;

        emit ChallengeCreatedWithRandomSong(
            challengeId,
            musicNFTTokenId,
            artistId,
            songTitle,
            artistUsername,
            ipfsAudioHash,
            randomness.value,
            challenge.startTime,
            DAILY_POOL
        );
    }

    // ========================================================================
    // GAMEPLAY - DELEGATION SUPPORT
    // ========================================================================

    function submitGuessFor(
        address beneficiary,
        uint256 challengeId,
        uint256 guessedArtistId,
        string memory guessedSongTitle,
        string memory guessedUsername
    ) public nonReentrant {
        DailyChallenge storage challenge = challenges[challengeId];
        require(challenge.active, "Challenge not active");
        require(challenge.randomnessFulfilled, "Challenge not ready");
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

        // Record guess
        UserGuess storage guess = userGuesses[challengeId][beneficiary];
        guess.challengeId = challengeId;
        guess.user = beneficiary;
        guess.guessedArtistId = guessedArtistId;
        guess.guessedSongTitle = guessedSongTitle;
        guess.guessedUsername = guessedUsername;
        guess.correct = correct;
        guess.timestamp = block.timestamp;
        guess.rewardEarned = reward;

        // Update player stats
        _updatePlayerStats(beneficiary, correct, reward);

        // Track player
        challengePlayers[challengeId].push(beneficiary);
        hasPlayed[beneficiary][challengeId] = true;

        // Distribute reward
        if (correct && reward > 0) {
            require(toursToken.transfer(beneficiary, reward), "Reward transfer failed");
        }

        emit GuessSubmitted(challengeId, beneficiary, challenge.artistId, challenge.artistUsername, correct, reward);
    }

    function submitGuess(
        uint256 challengeId,
        uint256 guessedArtistId,
        string memory guessedSongTitle
    ) external nonReentrant {
        submitGuessFor(msg.sender, challengeId, guessedArtistId, guessedSongTitle, "");
    }

    // ========================================================================
    // INTERNAL FUNCTIONS
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

    function getUserGuess(uint256 challengeId, address user) external view returns (UserGuess memory) {
        return userGuesses[challengeId][user];
    }

    function getChallengePlayers(uint256 challengeId) external view returns (address[] memory) {
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

        accuracy = totalPlayers > 0 ? (correctGuesses * 100) / totalPlayers : 0;
        timeRemaining = block.timestamp < challenge.endTime ? challenge.endTime - block.timestamp : 0;
    }

    function getRandomnessRequest(uint256 challengeId) external view returns (RandomnessRequest memory) {
        return randomnessRequests[challengeId];
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
