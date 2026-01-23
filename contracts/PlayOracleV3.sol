// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title IMusicSubscription
 * @notice Interface for MusicSubscription contract
 */
interface IMusicSubscription {
    function recordPlay(address user, uint256 masterTokenId, uint256 duration) external;
}

/**
 * @title PlayOracleV3
 * @notice Oracle contract for recording music plays from backend
 * @dev Authorized operators can submit validated play records to MusicSubscription
 *
 * V3 Changes:
 * - Added DAO timelock support for governance
 * - Added platform operator for registering User Safes
 * - Added pause functionality for emergencies
 * - Added onlyOwnerOrDAO modifier for operator management
 */
contract PlayOracleV3 is Ownable, ReentrancyGuard {

    // MusicSubscription contract reference
    IMusicSubscription public musicSubscription;

    // Authorized operators (backend services, User Safes)
    mapping(address => bool) public operators;

    // Platform operator for registering User Safes
    address public platformOperator;

    // DAO Timelock for governance actions
    address public daoTimelock;

    // Pause state for emergencies
    bool public paused;

    // Minimum replay interval (prevent spam)
    uint256 public minReplayInterval = 30; // 30 seconds default

    // Track last play time per user per song
    mapping(address => mapping(uint256 => uint256)) public lastPlayTime;

    // Total plays recorded
    uint256 public totalPlaysRecorded;

    // ============================================
    // Events
    // ============================================
    event PlayRecorded(address indexed user, uint256 indexed masterTokenId, uint256 duration, uint256 timestamp);
    event OperatorAdded(address indexed operator);
    event OperatorRemoved(address indexed operator);
    event MusicSubscriptionUpdated(address indexed newAddress);
    event ReplayIntervalUpdated(uint256 newInterval);
    event DAOTimelockUpdated(address indexed oldTimelock, address indexed newTimelock);
    event PlatformOperatorUpdated(address indexed oldOperator, address indexed newOperator);
    event Paused(address indexed by);
    event Unpaused(address indexed by);

    // ============================================
    // Modifiers
    // ============================================
    modifier onlyOperator() {
        require(operators[msg.sender] || msg.sender == owner(), "Not an authorized operator");
        _;
    }

    modifier onlyOwnerOrDAO() {
        require(
            msg.sender == owner() || msg.sender == daoTimelock,
            "Only owner or DAO"
        );
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Oracle is paused");
        _;
    }

    constructor(address _musicSubscription) Ownable(msg.sender) {
        musicSubscription = IMusicSubscription(_musicSubscription);
        // Add deployer as initial operator
        operators[msg.sender] = true;
        emit OperatorAdded(msg.sender);
    }

    // ============================================
    // Core Functions
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
    ) external onlyOperator nonReentrant whenNotPaused {
        require(user != address(0), "Invalid user address");
        require(masterTokenId > 0, "Invalid masterTokenId");
        require(duration >= 30, "Duration too short");

        // Check replay interval
        require(
            block.timestamp >= lastPlayTime[user][masterTokenId] + minReplayInterval,
            "Replay too soon"
        );

        // Update last play time
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
    ) external onlyOperator nonReentrant whenNotPaused {
        require(users.length == masterTokenIds.length && users.length == durations.length, "Array length mismatch");
        require(users.length <= 50, "Batch too large");

        for (uint256 i = 0; i < users.length; i++) {
            address user = users[i];
            uint256 masterTokenId = masterTokenIds[i];
            uint256 duration = durations[i];

            if (user == address(0) || masterTokenId == 0 || duration < 30) {
                continue; // Skip invalid entries
            }

            if (block.timestamp < lastPlayTime[user][masterTokenId] + minReplayInterval) {
                continue; // Skip if replay too soon
            }

            lastPlayTime[user][masterTokenId] = block.timestamp;
            totalPlaysRecorded++;

            musicSubscription.recordPlay(user, masterTokenId, duration);

            emit PlayRecorded(user, masterTokenId, duration, block.timestamp);
        }
    }

    // ============================================
    // View Functions
    // ============================================

    /**
     * @notice Check if a user can play a song (replay interval passed)
     */
    function canPlay(address user, uint256 masterTokenId) external view returns (bool) {
        return block.timestamp >= lastPlayTime[user][masterTokenId] + minReplayInterval;
    }

    /**
     * @notice Get last play timestamp for a user and song
     */
    function getLastPlayTime(address user, uint256 masterTokenId) external view returns (uint256) {
        return lastPlayTime[user][masterTokenId];
    }

    // ============================================
    // Operator Management (DAO Governed)
    // ============================================

    /**
     * @notice Add an operator (owner or DAO)
     * @param operator Address to add as operator
     */
    function addOperator(address operator) external onlyOwnerOrDAO {
        require(operator != address(0), "Invalid operator");
        require(!operators[operator], "Already an operator");
        operators[operator] = true;
        emit OperatorAdded(operator);
    }

    /**
     * @notice Remove an operator (owner or DAO)
     * @param operator Address to remove
     */
    function removeOperator(address operator) external onlyOwnerOrDAO {
        require(operators[operator], "Not an operator");
        operators[operator] = false;
        emit OperatorRemoved(operator);
    }

    /**
     * @notice Register a User Safe as an operator (for delegated execution)
     * @dev Called by platform operator when user creates their Safe
     * @param userSafe The User Safe address to authorize
     */
    function registerUserSafeAsOperator(address userSafe) external {
        require(msg.sender == platformOperator, "Only platform operator");
        require(userSafe != address(0), "Invalid Safe address");
        operators[userSafe] = true;
        emit OperatorAdded(userSafe);
    }

    // ============================================
    // Admin Functions
    // ============================================

    /**
     * @notice Set DAO timelock address for future governance
     * @param _daoTimelock Address of the DAO timelock contract
     */
    function setDAOTimelock(address _daoTimelock) external onlyOwner {
        address oldTimelock = daoTimelock;
        daoTimelock = _daoTimelock;
        emit DAOTimelockUpdated(oldTimelock, _daoTimelock);
    }

    /**
     * @notice Set platform operator address
     * @param _platformOperator Address of platform operator
     */
    function setPlatformOperator(address _platformOperator) external onlyOwner {
        address oldOperator = platformOperator;
        platformOperator = _platformOperator;
        emit PlatformOperatorUpdated(oldOperator, _platformOperator);
    }

    /**
     * @notice Update MusicSubscription contract address
     * @param _musicSubscription New MusicSubscription address
     */
    function setMusicSubscription(address _musicSubscription) external onlyOwner {
        require(_musicSubscription != address(0), "Invalid address");
        musicSubscription = IMusicSubscription(_musicSubscription);
        emit MusicSubscriptionUpdated(_musicSubscription);
    }

    /**
     * @notice Set minimum replay interval
     * @param _interval New interval in seconds (10 to 3600)
     */
    function setMinReplayInterval(uint256 _interval) external onlyOwner {
        require(_interval >= 10 && _interval <= 3600, "Interval out of range");
        minReplayInterval = _interval;
        emit ReplayIntervalUpdated(_interval);
    }

    /**
     * @notice Pause oracle operations (emergency only)
     */
    function pause() external onlyOwnerOrDAO {
        paused = true;
        emit Paused(msg.sender);
    }

    /**
     * @notice Unpause oracle operations
     */
    function unpause() external onlyOwnerOrDAO {
        paused = false;
        emit Unpaused(msg.sender);
    }
}
