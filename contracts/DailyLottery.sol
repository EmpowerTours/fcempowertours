// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@pythnetwork/entropy-sdk-solidity/IEntropyConsumer.sol";
import "@pythnetwork/entropy-sdk-solidity/IEntropyV2.sol";

interface IToursRewardManager {
    function distributeRewardWithMultiplier(
        address recipient,
        uint8 rewardType,  // RewardType enum as uint8
        uint256 multiplierBps
    ) external returns (uint256);
}

/**
 * @title DailyLottery
 * @notice A daily lottery on Monad where users buy tickets with WMON and a random winner
 *         is selected using Pyth Entropy. Features jackpot rollover if minimum entries not met.
 *
 *         Revenue Split:
 *         - 90% WMON to winner
 *         - 5% to DAO treasury
 *         - 5% to deployer
 *
 *         Bonus Rewards (TOURS token):
 *         - Winner: Random 10-100 TOURS
 *         - Draw trigger: Random 5-50 TOURS (incentive to call requestDraw)
 *
 *         Features:
 *         - 2 WMON per ticket (configurable)
 *         - Minimum 5 entries required for draw (otherwise rollover)
 *         - Jackpot rolls over to next round if minimum not met
 *         - Pyth Entropy for provably fair randomness
 *         - Delegation support (Platform Safe buys for User Safe)
 *         - Farcaster FID tracking for winner announcements
 */
contract DailyLottery is Ownable, ReentrancyGuard, IEntropyConsumer {
    using SafeERC20 for IERC20;

    // ============================================
    // State
    // ============================================

    IERC20 public immutable wmon;
    IToursRewardManager public toursRewardManager;
    IEntropyV2 public entropy;
    address public entropyProvider;

    // Revenue recipients
    address public treasury;  // DAO treasury (5%)
    address public immutable deployer;  // Contract deployer (5%)

    // QUEST = 6 in ToursRewardManager RewardType enum
    uint8 public constant REWARD_TYPE_QUEST = 6;

    uint256 public ticketPrice = 2 ether; // 2 WMON (18 decimals)
    uint256 public minEntries = 5; // Minimum entries for draw to happen

    // Revenue split (basis points, total = 10000)
    uint256 public constant WINNER_SHARE_BPS = 9000;    // 90%
    uint256 public constant TREASURY_SHARE_BPS = 500;   // 5%
    uint256 public constant DEPLOYER_SHARE_BPS = 500;   // 5%
    uint256 public constant BPS_DENOMINATOR = 10000;

    // TOURS reward multipliers (basis points, 10000 = 1x base QUEST reward of 5 TOURS)
    // Winner: 2x-20x (10-100 TOURS at base rate)
    uint256 public constant WINNER_MULTIPLIER_MIN = 20000;   // 2x = 10 TOURS
    uint256 public constant WINNER_MULTIPLIER_MAX = 200000;  // 20x = 100 TOURS
    // Trigger: 1x-10x (5-50 TOURS at base rate)
    uint256 public constant TRIGGER_MULTIPLIER_MIN = 10000;  // 1x = 5 TOURS
    uint256 public constant TRIGGER_MULTIPLIER_MAX = 100000; // 10x = 50 TOURS

    uint256 public roundDuration = 24 hours;
    uint256 public currentRound;
    uint256 public rolledOverPool; // WMON from previous rounds that didn't meet minimum

    struct Round {
        uint256 startTime;
        uint256 endTime;
        uint256 prizePool;      // This round's tickets + rollover
        uint256 ticketCount;
        address winner;
        uint256 winnerFid;
        uint256 winnerPrize;
        uint256 winnerToursBonus;
        address triggeredBy;
        uint256 triggerToursReward;
        bool drawn;
        bool resolved;
        bool rolledOver;        // True if this round didn't meet minimum and rolled over
    }

    struct Entry {
        address beneficiary; // User's Safe address (receives prize)
        uint256 userFid;     // Farcaster ID
    }

    struct DrawRequest {
        uint256 roundId;
        address triggeredBy;
        bool pending;
    }

    mapping(uint256 => Round) public rounds;
    mapping(uint256 => Entry[]) public roundEntries; // roundId => array of entries
    mapping(uint256 => mapping(address => uint256)) public userTickets; // roundId => beneficiary => ticket count
    mapping(uint64 => DrawRequest) public drawRequests; // entropy sequence => round

    // Winner history for display
    struct WinnerRecord {
        uint256 roundId;
        address winner;
        uint256 winnerFid;
        uint256 prize;
        uint256 toursBonus;
        uint256 timestamp;
        uint256 totalEntries;
    }
    WinnerRecord[] public winnerHistory;

    // ============================================
    // Events
    // ============================================

    event TicketPurchased(
        uint256 indexed roundId,
        address indexed beneficiary,
        uint256 userFid,
        uint256 ticketCount,
        uint256 totalCost
    );
    event DrawRequested(uint256 indexed roundId, uint64 sequenceNumber, address triggeredBy);
    event WinnerSelected(
        uint256 indexed roundId,
        address indexed winner,
        uint256 winnerFid,
        uint256 wmonPrize,
        uint256 toursBonus,
        uint256 totalEntries
    );
    event DrawTriggered(
        uint256 indexed roundId,
        address indexed triggeredBy,
        uint256 toursReward
    );
    event RoundStarted(uint256 indexed roundId, uint256 startTime, uint256 endTime, uint256 initialPool);
    event RoundRolledOver(uint256 indexed roundId, uint256 poolAmount, uint256 ticketCount);
    event TicketPriceUpdated(uint256 oldPrice, uint256 newPrice);
    event TreasuryUpdated(address oldTreasury, address newTreasury);
    event MinEntriesUpdated(uint256 oldMin, uint256 newMin);

    // ============================================
    // Constructor
    // ============================================

    constructor(
        address _wmon,
        address _toursRewardManager,
        address _entropy,
        address _treasury
    ) Ownable(msg.sender) {
        require(_wmon != address(0), "Invalid WMON");
        require(_toursRewardManager != address(0), "Invalid ToursRewardManager");
        require(_entropy != address(0), "Invalid Entropy");
        require(_treasury != address(0), "Invalid treasury");

        wmon = IERC20(_wmon);
        toursRewardManager = IToursRewardManager(_toursRewardManager);
        entropy = IEntropyV2(_entropy);
        entropyProvider = entropy.getDefaultProvider();
        treasury = _treasury;
        deployer = msg.sender;

        // Start first round
        _startNewRound(0);
    }

    // ============================================
    // Core Functions
    // ============================================

    /**
     * @notice Buy lottery tickets for a beneficiary (delegation pattern).
     * @param beneficiary The user's Safe address that will receive prize if won
     * @param userFid The user's Farcaster ID for tracking/announcements
     * @param ticketCount Number of tickets to purchase (1-100)
     * @dev WMON is transferred from msg.sender (Platform Safe or User Safe)
     */
    function buyTicketsFor(
        address beneficiary,
        uint256 userFid,
        uint256 ticketCount
    ) external nonReentrant {
        require(beneficiary != address(0), "Invalid beneficiary");
        require(userFid > 0, "Invalid FID");
        require(ticketCount > 0 && ticketCount <= 100, "Invalid ticket count");

        Round storage round = rounds[currentRound];
        require(block.timestamp < round.endTime, "Round ended");
        require(!round.drawn, "Draw in progress");

        uint256 totalCost = ticketPrice * ticketCount;

        // Transfer WMON from caller (Platform Safe or User Safe)
        wmon.safeTransferFrom(msg.sender, address(this), totalCost);

        // Record tickets
        round.prizePool += totalCost;
        round.ticketCount += ticketCount;
        userTickets[currentRound][beneficiary] += ticketCount;

        // Add entries (each ticket = one entry)
        for (uint256 i = 0; i < ticketCount; i++) {
            roundEntries[currentRound].push(Entry({
                beneficiary: beneficiary,
                userFid: userFid
            }));
        }

        emit TicketPurchased(currentRound, beneficiary, userFid, ticketCount, totalCost);
    }

    /**
     * @notice Buy tickets for yourself (direct interaction).
     * @param userFid Your Farcaster ID
     * @param ticketCount Number of tickets to purchase
     */
    function buyTickets(uint256 userFid, uint256 ticketCount) external nonReentrant {
        require(userFid > 0, "Invalid FID");
        require(ticketCount > 0 && ticketCount <= 100, "Invalid ticket count");

        Round storage round = rounds[currentRound];
        require(block.timestamp < round.endTime, "Round ended");
        require(!round.drawn, "Draw in progress");

        uint256 totalCost = ticketPrice * ticketCount;

        // Transfer WMON from caller
        wmon.safeTransferFrom(msg.sender, address(this), totalCost);

        // Record tickets - msg.sender is the beneficiary
        round.prizePool += totalCost;
        round.ticketCount += ticketCount;
        userTickets[currentRound][msg.sender] += ticketCount;

        // Add entries
        for (uint256 i = 0; i < ticketCount; i++) {
            roundEntries[currentRound].push(Entry({
                beneficiary: msg.sender,
                userFid: userFid
            }));
        }

        emit TicketPurchased(currentRound, msg.sender, userFid, ticketCount, totalCost);
    }

    /**
     * @notice Request the draw for the current round. Anyone can call after round ends.
     *         Requires MON for Pyth Entropy fee. Caller gets random 5-50 TOURS reward.
     */
    function requestDraw() external payable nonReentrant {
        Round storage round = rounds[currentRound];
        require(block.timestamp >= round.endTime, "Round not ended");
        require(!round.drawn, "Already drawn");

        // Check minimum entries
        if (round.ticketCount < minEntries) {
            // Rollover: add this round's pool to rollover and start new round
            rolledOverPool += round.prizePool;
            round.rolledOver = true;
            round.drawn = true;
            round.resolved = true;

            emit RoundRolledOver(currentRound, round.prizePool, round.ticketCount);

            _startNewRound(rolledOverPool);
            rolledOverPool = 0;
            return;
        }

        // Get entropy fee
        uint256 fee = entropy.getFeeV2();
        require(msg.value >= fee, "Insufficient fee for entropy");

        // Request randomness
        uint64 sequenceNumber = entropy.requestV2{value: fee}();
        drawRequests[sequenceNumber] = DrawRequest({
            roundId: currentRound,
            triggeredBy: msg.sender,
            pending: true
        });

        round.drawn = true;
        round.triggeredBy = msg.sender;

        // Refund excess MON
        if (msg.value > fee) {
            (bool success, ) = msg.sender.call{value: msg.value - fee}("");
            require(success, "Refund failed");
        }

        emit DrawRequested(currentRound, sequenceNumber, msg.sender);
    }

    /**
     * @notice Force rollover if round ended with insufficient entries. Anyone can call.
     */
    function forceRollover() external {
        Round storage round = rounds[currentRound];
        require(block.timestamp >= round.endTime, "Round not ended");
        require(!round.drawn, "Already processed");
        require(round.ticketCount < minEntries, "Has enough entries, use requestDraw");

        // Rollover
        rolledOverPool += round.prizePool;
        round.rolledOver = true;
        round.drawn = true;
        round.resolved = true;

        emit RoundRolledOver(currentRound, round.prizePool, round.ticketCount);

        _startNewRound(rolledOverPool);
        rolledOverPool = 0;
    }

    /**
     * @dev Pyth Entropy callback - selects winner and distributes prizes.
     */
    function entropyCallback(
        uint64 sequenceNumber,
        address,
        bytes32 randomNumber
    ) internal override {
        DrawRequest memory req = drawRequests[sequenceNumber];
        require(req.pending, "Invalid request");
        delete drawRequests[sequenceNumber];

        _resolveRound(req.roundId, req.triggeredBy, uint256(randomNumber));
    }

    /**
     * @dev Internal function to resolve round and distribute prizes.
     */
    function _resolveRound(uint256 roundId, address triggeredBy, uint256 rand) internal {
        Round storage round = rounds[roundId];
        require(!round.resolved, "Already resolved");

        // Select winner
        uint256 winnerIndex = rand % round.ticketCount;
        Entry memory winner = roundEntries[roundId][winnerIndex];

        // Calculate prizes
        uint256 winnerPrize = (round.prizePool * WINNER_SHARE_BPS) / BPS_DENOMINATOR;
        uint256 treasuryShare = (round.prizePool * TREASURY_SHARE_BPS) / BPS_DENOMINATOR;
        uint256 deployerShare = round.prizePool - winnerPrize - treasuryShare;

        // Calculate random TOURS multipliers
        uint256 winnerMultiplier = WINNER_MULTIPLIER_MIN + ((rand >> 128) % (WINNER_MULTIPLIER_MAX - WINNER_MULTIPLIER_MIN));
        uint256 triggerMultiplier = TRIGGER_MULTIPLIER_MIN + ((rand >> 192) % (TRIGGER_MULTIPLIER_MAX - TRIGGER_MULTIPLIER_MIN));

        // Distribute TOURS via ToursRewardManager (may return 0 if cap reached or insufficient balance)
        uint256 winnerToursBonus = _distributeToursReward(winner.beneficiary, winnerMultiplier);
        uint256 triggerToursReward = _distributeToursReward(triggeredBy, triggerMultiplier);

        // Update state
        round.winner = winner.beneficiary;
        round.winnerFid = winner.userFid;
        round.winnerPrize = winnerPrize;
        round.winnerToursBonus = winnerToursBonus;
        round.triggerToursReward = triggerToursReward;
        round.triggeredBy = triggeredBy;
        round.resolved = true;

        // Record winner history
        _recordWinner(roundId, winner, winnerPrize, winnerToursBonus, round.ticketCount);

        // Distribute WMON prizes
        _distributeWmonPrizes(winner.beneficiary, winnerPrize, treasuryShare, deployerShare);

        emit WinnerSelected(roundId, winner.beneficiary, winner.userFid, winnerPrize, winnerToursBonus, round.ticketCount);
        emit DrawTriggered(roundId, triggeredBy, triggerToursReward);

        // Start next round
        _startNewRound(0);
    }

    /**
     * @dev Record winner in history.
     */
    function _recordWinner(uint256 roundId, Entry memory winner, uint256 prize, uint256 toursBonus, uint256 totalEntries) internal {
        winnerHistory.push(WinnerRecord({
            roundId: roundId,
            winner: winner.beneficiary,
            winnerFid: winner.userFid,
            prize: prize,
            toursBonus: toursBonus,
            timestamp: block.timestamp,
            totalEntries: totalEntries
        }));
    }

    /**
     * @dev Distribute TOURS reward via ToursRewardManager.
     *      Returns 0 if ToursRewardManager reverts (e.g., daily cap reached, insufficient balance).
     */
    function _distributeToursReward(address recipient, uint256 multiplierBps) internal returns (uint256) {
        if (address(toursRewardManager) == address(0)) return 0;

        try toursRewardManager.distributeRewardWithMultiplier(
            recipient,
            REWARD_TYPE_QUEST,
            multiplierBps
        ) returns (uint256 amount) {
            return amount;
        } catch {
            // ToursRewardManager may revert if daily cap reached, paused, or insufficient balance
            return 0;
        }
    }

    /**
     * @dev Distribute WMON prizes to winner, treasury, and deployer.
     */
    function _distributeWmonPrizes(
        address winnerAddr,
        uint256 winnerPrize,
        uint256 treasuryShare,
        uint256 deployerShare
    ) internal {
        wmon.safeTransfer(winnerAddr, winnerPrize);
        wmon.safeTransfer(treasury, treasuryShare);
        wmon.safeTransfer(deployer, deployerShare);
    }

    /**
     * @dev Required by IEntropyConsumer.
     */
    function getEntropy() internal view override returns (address) {
        return address(entropy);
    }

    // ============================================
    // Internal Functions
    // ============================================

    function _startNewRound(uint256 initialPool) internal {
        currentRound++;
        uint256 startTime = block.timestamp;
        uint256 endTime = startTime + roundDuration;

        rounds[currentRound] = Round({
            startTime: startTime,
            endTime: endTime,
            prizePool: initialPool,
            ticketCount: 0,
            winner: address(0),
            winnerFid: 0,
            winnerPrize: 0,
            winnerToursBonus: 0,
            triggeredBy: address(0),
            triggerToursReward: 0,
            drawn: false,
            resolved: false,
            rolledOver: false
        });

        emit RoundStarted(currentRound, startTime, endTime, initialPool);
    }

    // ============================================
    // View Functions
    // ============================================

    /**
     * @notice Get current round info.
     */
    function getCurrentRound() external view returns (
        uint256 roundId,
        uint256 startTime,
        uint256 endTime,
        uint256 prizePool,
        uint256 ticketCount,
        uint256 timeRemaining,
        bool canDraw,
        bool willRollover
    ) {
        Round storage round = rounds[currentRound];
        roundId = currentRound;
        startTime = round.startTime;
        endTime = round.endTime;
        prizePool = round.prizePool;
        ticketCount = round.ticketCount;
        timeRemaining = block.timestamp < round.endTime ? round.endTime - block.timestamp : 0;
        canDraw = block.timestamp >= round.endTime && !round.drawn && round.ticketCount >= minEntries;
        willRollover = round.ticketCount < minEntries;
    }

    /**
     * @notice Get user's ticket count for current round.
     */
    function getUserTickets(address user) external view returns (uint256) {
        return userTickets[currentRound][user];
    }

    /**
     * @notice Get user's ticket count for a specific round.
     */
    function getUserTicketsForRound(uint256 roundId, address user) external view returns (uint256) {
        return userTickets[roundId][user];
    }

    /**
     * @notice Get round details.
     */
    function getRound(uint256 roundId) external view returns (
        uint256 startTime,
        uint256 endTime,
        uint256 prizePool,
        uint256 ticketCount,
        address winner,
        uint256 winnerFid,
        uint256 winnerPrize,
        uint256 winnerToursBonus,
        bool resolved,
        bool rolledOver
    ) {
        Round storage round = rounds[roundId];
        return (
            round.startTime,
            round.endTime,
            round.prizePool,
            round.ticketCount,
            round.winner,
            round.winnerFid,
            round.winnerPrize,
            round.winnerToursBonus,
            round.resolved,
            round.rolledOver
        );
    }

    /**
     * @notice Get recent winners (up to last 10).
     */
    function getRecentWinners(uint256 count) external view returns (WinnerRecord[] memory) {
        uint256 len = winnerHistory.length;
        if (count > len) count = len;
        if (count > 10) count = 10;

        WinnerRecord[] memory recent = new WinnerRecord[](count);
        for (uint256 i = 0; i < count; i++) {
            recent[i] = winnerHistory[len - 1 - i];
        }
        return recent;
    }

    /**
     * @notice Get total winners count.
     */
    function getWinnerCount() external view returns (uint256) {
        return winnerHistory.length;
    }

    /**
     * @notice Get entropy fee for requesting draw.
     */
    function getEntropyFee() external view returns (uint256) {
        return entropy.getFeeV2();
    }

    /**
     * @notice Calculate potential winner prize for current pool.
     */
    function getPotentialWinnerPrize() external view returns (uint256) {
        Round storage round = rounds[currentRound];
        return (round.prizePool * WINNER_SHARE_BPS) / BPS_DENOMINATOR;
    }

    // ============================================
    // Admin Functions
    // ============================================

    /**
     * @notice Update ticket price (only affects future purchases).
     */
    function setTicketPrice(uint256 _ticketPrice) external onlyOwner {
        require(_ticketPrice >= 0.1 ether, "Price too low");
        require(_ticketPrice <= 100 ether, "Price too high");
        uint256 oldPrice = ticketPrice;
        ticketPrice = _ticketPrice;
        emit TicketPriceUpdated(oldPrice, _ticketPrice);
    }

    /**
     * @notice Update minimum entries required for draw.
     */
    function setMinEntries(uint256 _minEntries) external onlyOwner {
        require(_minEntries >= 1, "Min too low");
        require(_minEntries <= 100, "Min too high");
        uint256 oldMin = minEntries;
        minEntries = _minEntries;
        emit MinEntriesUpdated(oldMin, _minEntries);
    }

    /**
     * @notice Update DAO treasury address.
     */
    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid address");
        address oldTreasury = treasury;
        treasury = _treasury;
        emit TreasuryUpdated(oldTreasury, _treasury);
    }

    /**
     * @notice Update round duration (only affects future rounds).
     */
    function setRoundDuration(uint256 _duration) external onlyOwner {
        require(_duration >= 1 hours, "Too short");
        require(_duration <= 7 days, "Too long");
        roundDuration = _duration;
    }

    /**
     * @notice Emergency withdraw stuck tokens (only if no active round).
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        require(token != address(wmon) || rounds[currentRound].resolved, "Cannot withdraw active pool");
        IERC20(token).safeTransfer(owner(), amount);
    }

    /**
     * @notice Allow contract to receive MON for entropy fees.
     */
    receive() external payable {}
}
