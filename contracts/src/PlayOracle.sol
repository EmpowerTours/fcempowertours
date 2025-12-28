// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IMusicSubscription {
    function recordPlay(address user, uint256 masterTokenId, uint256 duration) external;
}

/**
 * @title PlayOracle
 * @notice Oracle contract for recording music plays from backend
 * @dev Authorized operators can submit validated play records to MusicSubscriptionV2
 */
contract PlayOracle is Ownable, ReentrancyGuard {
    // ============================================
    // State
    // ============================================

    IMusicSubscription public musicSubscription;

    mapping(address => bool) public operators;

    uint256 public totalPlaysRecorded;

    // Anti-replay: user => masterTokenId => lastPlayTimestamp
    mapping(address => mapping(uint256 => uint256)) public lastPlayTime;
    uint256 public minReplayInterval = 30 seconds; // Minimum time between replays of same song

    // ============================================
    // Events
    // ============================================

    event OperatorAdded(address indexed operator);
    event OperatorRemoved(address indexed operator);
    event MusicSubscriptionUpdated(address indexed newAddress);
    event PlayRecorded(address indexed user, uint256 indexed masterTokenId, uint256 duration, uint256 timestamp);
    event ReplayIntervalUpdated(uint256 newInterval);

    // ============================================
    // Modifiers
    // ============================================

    modifier onlyOperator() {
        require(operators[msg.sender] || msg.sender == owner(), "Not authorized operator");
        _;
    }

    // ============================================
    // Constructor
    // ============================================

    constructor(address _musicSubscription) Ownable(msg.sender) {
        musicSubscription = IMusicSubscription(_musicSubscription);
        operators[msg.sender] = true; // Owner is operator by default
        emit OperatorAdded(msg.sender);
    }

    // ============================================
    // Operator Functions
    // ============================================

    /**
     * @notice Record a validated play from the backend
     * @param user The address of the user who played the song
     * @param masterTokenId The master NFT token ID
     * @param duration Play duration in seconds
     */
    function recordPlay(
        address user,
        uint256 masterTokenId,
        uint256 duration
    ) external onlyOperator nonReentrant {
        require(user != address(0), "Invalid user address");
        require(masterTokenId > 0, "Invalid token ID");
        require(duration >= 30, "Duration too short");

        // Anti-replay check
        uint256 lastPlay = lastPlayTime[user][masterTokenId];
        require(
            block.timestamp >= lastPlay + minReplayInterval,
            "Replay too soon"
        );

        lastPlayTime[user][masterTokenId] = block.timestamp;
        totalPlaysRecorded++;

        // Forward to MusicSubscription
        musicSubscription.recordPlay(user, masterTokenId, duration);

        emit PlayRecorded(user, masterTokenId, duration, block.timestamp);
    }

    /**
     * @notice Batch record multiple plays (gas efficient for high volume)
     * @param users Array of user addresses
     * @param masterTokenIds Array of master token IDs
     * @param durations Array of play durations
     */
    function batchRecordPlays(
        address[] calldata users,
        uint256[] calldata masterTokenIds,
        uint256[] calldata durations
    ) external onlyOperator nonReentrant {
        require(
            users.length == masterTokenIds.length && users.length == durations.length,
            "Array length mismatch"
        );
        require(users.length <= 50, "Batch too large");

        for (uint256 i = 0; i < users.length; i++) {
            address user = users[i];
            uint256 masterTokenId = masterTokenIds[i];
            uint256 duration = durations[i];

            if (user == address(0) || masterTokenId == 0 || duration < 30) {
                continue; // Skip invalid entries
            }

            uint256 lastPlay = lastPlayTime[user][masterTokenId];
            if (block.timestamp < lastPlay + minReplayInterval) {
                continue; // Skip replay violations
            }

            lastPlayTime[user][masterTokenId] = block.timestamp;
            totalPlaysRecorded++;

            musicSubscription.recordPlay(user, masterTokenId, duration);

            emit PlayRecorded(user, masterTokenId, duration, block.timestamp);
        }
    }

    // ============================================
    // Admin Functions
    // ============================================

    function addOperator(address operator) external onlyOwner {
        require(operator != address(0), "Invalid operator");
        require(!operators[operator], "Already operator");
        operators[operator] = true;
        emit OperatorAdded(operator);
    }

    function removeOperator(address operator) external onlyOwner {
        require(operators[operator], "Not an operator");
        operators[operator] = false;
        emit OperatorRemoved(operator);
    }

    function setMusicSubscription(address _musicSubscription) external onlyOwner {
        require(_musicSubscription != address(0), "Invalid address");
        musicSubscription = IMusicSubscription(_musicSubscription);
        emit MusicSubscriptionUpdated(_musicSubscription);
    }

    function setMinReplayInterval(uint256 _interval) external onlyOwner {
        require(_interval >= 10 && _interval <= 3600, "Interval out of range");
        minReplayInterval = _interval;
        emit ReplayIntervalUpdated(_interval);
    }

    // ============================================
    // View Functions
    // ============================================

    function canPlay(address user, uint256 masterTokenId) external view returns (bool) {
        return block.timestamp >= lastPlayTime[user][masterTokenId] + minReplayInterval;
    }

    function getLastPlayTime(address user, uint256 masterTokenId) external view returns (uint256) {
        return lastPlayTime[user][masterTokenId];
    }
}
