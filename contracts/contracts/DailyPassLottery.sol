// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title IshMON
 * @notice Interface for shMONAD liquid staking token (ERC4626)
 */
interface IshMON is IERC20 {
    function convertToAssets(uint256 shares) external view returns (uint256);
    function convertToShares(uint256 assets) external view returns (uint256);
}

/**
 * @title DailyPassLottery
 * @notice Daily lottery on Monad - Enter with MON or shMON, win the pot!
 * @dev Users pay 1 MON (or equivalent shMON) for a daily pass/lottery entry
 *
 * Flow:
 * 1. User opens app after splash screen
 * 2. Pays 1 MON → gets Daily Pass (lottery entry)
 * 3. At end of day, random winner selected
 * 4. Winner gets prize pool (minus platform fee)
 *
 * Testnet: 0x3a98250F98Dd388C211206983453837C8365BDc1 (shMON)
 * Mainnet: 0x1B68626dCa36c7fE922fD2d55E4f631d962dE19c (shMON)
 */
contract DailyPassLottery is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============================================
    // Constants & Configuration
    // ============================================
    uint256 public constant ENTRY_FEE = 1 ether; // 1 MON
    uint256 public constant PLATFORM_FEE_BPS = 1000; // 10% platform fee
    uint256 public constant BASIS_POINTS = 10000;

    IshMON public shMonToken;
    address public platformWallet;
    bool public shMonEnabled;

    // ============================================
    // Daily Round State
    // ============================================
    struct DailyRound {
        uint256 roundId;
        uint256 startTime;
        uint256 endTime;
        uint256 prizePool;
        uint256 participantCount;
        address winner;
        bool finalized;
    }

    struct DailyPass {
        uint256 roundId;
        address holder;
        uint256 entryTime;
        bool paidWithShMon;
        uint256 entryIndex; // Position in round
    }

    // Current round ID (increments daily)
    uint256 public currentRoundId;

    // Round data
    mapping(uint256 => DailyRound) public rounds;
    mapping(uint256 => address[]) public roundParticipants;
    mapping(uint256 => mapping(address => bool)) public hasEnteredRound;

    // User's daily passes
    mapping(address => DailyPass[]) public userPasses;

    // Stats
    uint256 public totalPrizesPaid;
    uint256 public totalParticipants;

    // ============================================
    // Events
    // ============================================
    event RoundStarted(uint256 indexed roundId, uint256 startTime, uint256 endTime);
    event DailyPassPurchased(
        uint256 indexed roundId,
        address indexed user,
        uint256 entryIndex,
        bool paidWithShMon,
        uint256 prizePoolAfter
    );
    event WinnerSelected(
        uint256 indexed roundId,
        address indexed winner,
        uint256 prizeAmount,
        uint256 participantCount
    );
    event ShMonToggled(bool enabled);
    event ShMonTokenUpdated(address indexed token);

    // ============================================
    // Constructor
    // ============================================
    constructor(address _platformWallet, address _shMonToken) Ownable(msg.sender) {
        require(_platformWallet != address(0), "Invalid platform wallet");
        platformWallet = _platformWallet;

        if (_shMonToken != address(0)) {
            shMonToken = IshMON(_shMonToken);
            shMonEnabled = true;
        }

        // Start first round
        _startNewRound();
    }

    // ============================================
    // Entry Functions
    // ============================================

    /**
     * @notice Enter today's lottery with MON
     * @dev Pays 1 MON, gets a Daily Pass
     */
    function enterWithMon() external payable nonReentrant returns (uint256 entryIndex) {
        require(msg.value >= ENTRY_FEE, "Entry fee is 1 MON");
        require(!hasEnteredRound[currentRoundId][msg.sender], "Already entered today");

        // Check if round ended, start new one
        _checkAndRotateRound();

        return _processEntry(msg.sender, msg.value, false);
    }

    /**
     * @notice Enter today's lottery with shMON
     * @param shMonAmount Amount of shMON to pay
     */
    function enterWithShMon(uint256 shMonAmount) external nonReentrant returns (uint256 entryIndex) {
        require(shMonEnabled, "shMON payments disabled");
        require(address(shMonToken) != address(0), "shMON not configured");
        require(!hasEnteredRound[currentRoundId][msg.sender], "Already entered today");

        // Check shMON value covers entry fee
        uint256 monEquivalent = shMonToken.convertToAssets(shMonAmount);
        require(monEquivalent >= ENTRY_FEE, "Insufficient shMON value");

        // Check if round ended, start new one
        _checkAndRotateRound();

        // Transfer shMON
        IERC20(address(shMonToken)).safeTransferFrom(msg.sender, address(this), shMonAmount);

        return _processEntry(msg.sender, monEquivalent, true);
    }

    /**
     * @notice Get shMON amount required for entry
     */
    function getShMonEntryFee() external view returns (uint256) {
        if (address(shMonToken) == address(0)) return 0;
        return shMonToken.convertToShares(ENTRY_FEE);
    }

    /**
     * @dev Process entry and issue Daily Pass
     */
    function _processEntry(
        address user,
        uint256 monValue,
        bool paidWithShMon
    ) internal returns (uint256 entryIndex) {
        DailyRound storage round = rounds[currentRoundId];

        // Calculate prize pool contribution (90% to pool, 10% platform)
        uint256 platformFee = (monValue * PLATFORM_FEE_BPS) / BASIS_POINTS;
        uint256 toPrizePool = monValue - platformFee;

        // Update round
        round.prizePool += toPrizePool;
        entryIndex = round.participantCount;
        round.participantCount++;

        // Track participant
        roundParticipants[currentRoundId].push(user);
        hasEnteredRound[currentRoundId][user] = true;

        // Issue Daily Pass
        userPasses[user].push(DailyPass({
            roundId: currentRoundId,
            holder: user,
            entryTime: block.timestamp,
            paidWithShMon: paidWithShMon,
            entryIndex: entryIndex
        }));

        // Stats
        totalParticipants++;

        // Transfer platform fee (only for MON payments)
        if (!paidWithShMon && platformFee > 0) {
            (bool success, ) = platformWallet.call{value: platformFee}("");
            require(success, "Platform fee transfer failed");
        }

        emit DailyPassPurchased(
            currentRoundId,
            user,
            entryIndex,
            paidWithShMon,
            round.prizePool
        );

        return entryIndex;
    }

    // ============================================
    // Winner Selection
    // ============================================

    /**
     * @notice Select winner for a completed round (owner only)
     * @param roundId The round to finalize
     * @param randomSeed External randomness (from backend/oracle)
     */
    function selectWinner(uint256 roundId, uint256 randomSeed) external onlyOwner nonReentrant {
        DailyRound storage round = rounds[roundId];

        require(!round.finalized, "Round already finalized");
        require(block.timestamp >= round.endTime, "Round not ended");
        require(round.participantCount > 0, "No participants");

        // Select winner using randomSeed
        uint256 winnerIndex = randomSeed % round.participantCount;
        address winner = roundParticipants[roundId][winnerIndex];

        round.winner = winner;
        round.finalized = true;

        uint256 prizeAmount = round.prizePool;
        totalPrizesPaid += prizeAmount;

        // Transfer prize
        (bool success, ) = winner.call{value: prizeAmount}("");
        require(success, "Prize transfer failed");

        emit WinnerSelected(roundId, winner, prizeAmount, round.participantCount);
    }

    /**
     * @notice Generate pseudo-random seed (for testing only!)
     * @dev In production, use Chainlink VRF or similar
     */
    function generateTestRandomSeed(uint256 roundId) external view returns (uint256) {
        return uint256(keccak256(abi.encodePacked(
            blockhash(block.number - 1),
            block.timestamp,
            roundId,
            rounds[roundId].participantCount
        )));
    }

    // ============================================
    // Round Management
    // ============================================

    /**
     * @dev Check if current round ended and start new one
     */
    function _checkAndRotateRound() internal {
        if (block.timestamp >= rounds[currentRoundId].endTime) {
            _startNewRound();
        }
    }

    /**
     * @dev Start a new daily round
     */
    function _startNewRound() internal {
        currentRoundId++;

        // Round runs from now until midnight UTC (simplified: 24 hours from now)
        uint256 startTime = block.timestamp;
        uint256 endTime = startTime + 24 hours;

        rounds[currentRoundId] = DailyRound({
            roundId: currentRoundId,
            startTime: startTime,
            endTime: endTime,
            prizePool: 0,
            participantCount: 0,
            winner: address(0),
            finalized: false
        });

        emit RoundStarted(currentRoundId, startTime, endTime);
    }

    /**
     * @notice Force start new round (owner only, for testing)
     */
    function forceNewRound() external onlyOwner {
        _startNewRound();
    }

    // ============================================
    // View Functions
    // ============================================

    /**
     * @notice Get current round info
     */
    function getCurrentRound() external view returns (DailyRound memory) {
        return rounds[currentRoundId];
    }

    /**
     * @notice Check if user has entered today
     */
    function hasEnteredToday(address user) external view returns (bool) {
        return hasEnteredRound[currentRoundId][user];
    }

    /**
     * @notice Get user's all daily passes
     */
    function getUserPasses(address user) external view returns (DailyPass[] memory) {
        return userPasses[user];
    }

    /**
     * @notice Get round participants
     */
    function getRoundParticipants(uint256 roundId) external view returns (address[] memory) {
        return roundParticipants[roundId];
    }

    /**
     * @notice Get time remaining in current round
     */
    function getTimeRemaining() external view returns (uint256) {
        DailyRound memory round = rounds[currentRoundId];
        if (block.timestamp >= round.endTime) return 0;
        return round.endTime - block.timestamp;
    }

    /**
     * @notice Get contract stats
     */
    function getStats() external view returns (
        uint256 _currentRoundId,
        uint256 _currentPrizePool,
        uint256 _currentParticipants,
        uint256 _totalPrizesPaid,
        uint256 _totalParticipants
    ) {
        DailyRound memory round = rounds[currentRoundId];
        return (
            currentRoundId,
            round.prizePool,
            round.participantCount,
            totalPrizesPaid,
            totalParticipants
        );
    }

    // ============================================
    // Admin Functions
    // ============================================

    function setShMonToken(address _shMonToken) external onlyOwner {
        shMonToken = IshMON(_shMonToken);
        emit ShMonTokenUpdated(_shMonToken);
    }

    function toggleShMon(bool enabled) external onlyOwner {
        shMonEnabled = enabled;
        emit ShMonToggled(enabled);
    }

    function setPlatformWallet(address _wallet) external onlyOwner {
        require(_wallet != address(0), "Invalid address");
        platformWallet = _wallet;
    }

    function withdrawShMon() external onlyOwner {
        require(address(shMonToken) != address(0), "shMON not configured");
        uint256 balance = shMonToken.balanceOf(address(this));
        require(balance > 0, "No shMON");
        IERC20(address(shMonToken)).safeTransfer(owner(), balance);
    }

    function emergencyWithdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        if (balance > 0) {
            (bool success, ) = owner().call{value: balance}("");
            require(success, "Withdraw failed");
        }
    }

    receive() external payable {
        // Direct sends treated as MON entry
        if (msg.value >= ENTRY_FEE && !hasEnteredRound[currentRoundId][msg.sender]) {
            _checkAndRotateRound();
            _processEntry(msg.sender, msg.value, false);
        }
    }
}
