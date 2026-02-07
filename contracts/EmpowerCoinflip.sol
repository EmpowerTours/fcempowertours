// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@pythnetwork/entropy-sdk-solidity/IEntropyConsumer.sol";
import "@pythnetwork/entropy-sdk-solidity/IEntropyV2.sol";

/**
 * @title EmpowerCoinflip
 * @notice Secure on-chain coinflip prediction game using Pyth Entropy
 * @author EmpowerTours
 *
 * @dev This contract provides verifiable random coinflip outcomes.
 * Unlike contracts using block-based pseudo-randomness (vulnerable to
 * prediction, miner manipulation, and MEV attacks), we use Pyth Entropy
 * for true verifiable randomness.
 *
 * === SECURITY FEATURES ===
 * - Pyth Entropy: Verifiable randomness from off-chain entropy source
 * - Time-locked rounds: Prevents flash loan balance manipulation
 * - Minimum stake duration: Prevents same-block betting/resolution
 * - Reentrancy guards: Prevents callback attacks
 *
 * === GAME MECHANICS ===
 * - Agents bet EMPTOURS on HEADS (0) or TAILS (1)
 * - Pyth Entropy determines outcome (random % 2)
 * - Winners split losers' pool proportionally (parimutuel)
 * - Losers receive random 1-5 TOURS consolation (same random seed)
 *
 * === ROUND LIFECYCLE ===
 * 1. OPEN: Accept bets (55 minutes)
 * 2. CLOSED: No more bets, request Pyth randomness
 * 3. RESOLVING: Waiting for Pyth callback
 * 4. RESOLVED: Payouts available for claim
 */
contract EmpowerCoinflip is Ownable, ReentrancyGuard, IEntropyConsumer {
    using SafeERC20 for IERC20;

    // ============================================
    // Enums & Structs
    // ============================================

    enum Prediction { HEADS, TAILS }
    enum RoundStatus { OPEN, CLOSED, RESOLVING, RESOLVED }

    struct Bet {
        address bettor;
        Prediction prediction;
        uint256 amount;         // EMPTOURS wagered
        uint256 timestamp;      // When bet was placed
        bool claimed;           // Whether payout was claimed
    }

    struct Round {
        uint256 id;
        RoundStatus status;
        uint256 startedAt;
        uint256 closesAt;
        uint256 totalHeads;     // Total EMPTOURS on heads
        uint256 totalTails;     // Total EMPTOURS on tails
        Prediction result;      // Winning side (set after resolution)
        uint64 entropySequence; // Pyth request sequence number
        bytes32 randomNumber;   // The Pyth random result
        uint256 resolvedAt;
        uint256 betCount;
    }

    struct ConsolationPrize {
        uint256 amount;         // TOURS amount
        uint8 multiplier;       // 1-5x
        bool claimed;
    }

    // ============================================
    // Constants
    // ============================================

    uint256 public constant MIN_BET = 10 ether;          // 10 EMPTOURS minimum
    uint256 public constant MAX_BET = 1000 ether;        // 1000 EMPTOURS maximum
    uint256 public constant ROUND_DURATION = 55 minutes; // Betting window
    uint256 public constant MIN_STAKE_DURATION = 1 minutes; // Anti-flash loan
    uint256 public constant CONSOLATION_BASE = 1 ether;  // 1 TOURS base
    uint256 public constant MAX_CONSOLATION_MULTIPLIER = 5; // Up to 5x

    // ============================================
    // State
    // ============================================

    IERC20 public immutable emptours;  // Betting token
    IERC20 public immutable tours;     // Consolation prize token
    IEntropyV2 public immutable entropy;
    address public entropyProvider;

    uint256 public currentRoundId;
    mapping(uint256 => Round) public rounds;
    mapping(uint256 => mapping(uint256 => Bet)) public roundBets; // roundId => betIndex => Bet
    mapping(uint256 => mapping(address => uint256)) public roundBetIndex; // roundId => bettor => betIndex+1
    mapping(uint256 => mapping(address => ConsolationPrize)) public consolationPrizes;

    // Operator can trigger round transitions
    address public operator;

    // Treasury for protocol fees
    address public treasury;

    // ============================================
    // Events
    // ============================================

    event RoundStarted(uint256 indexed roundId, uint256 closesAt);
    event BetPlaced(uint256 indexed roundId, address indexed bettor, Prediction prediction, uint256 amount);
    event RoundClosed(uint256 indexed roundId, uint256 totalHeads, uint256 totalTails, uint256 betCount);
    event RandomnessRequested(uint256 indexed roundId, uint64 sequenceNumber);
    event RoundResolved(uint256 indexed roundId, Prediction result, bytes32 randomNumber);
    event PayoutClaimed(uint256 indexed roundId, address indexed bettor, uint256 amount, bool won);
    event ConsolationClaimed(uint256 indexed roundId, address indexed bettor, uint256 amount, uint8 multiplier);
    event OperatorUpdated(address indexed oldOperator, address indexed newOperator);

    // ============================================
    // Errors
    // ============================================

    error RoundNotOpen();
    error RoundNotClosed();
    error RoundNotResolved();
    error BettingClosed();
    error InvalidBetAmount();
    error AlreadyBet();
    error NoBetFound();
    error AlreadyClaimed();
    error InsufficientBalance();
    error OnlyOperator();
    error InvalidPrediction();
    error StakeTooRecent();
    error TransferFailed();
    error NotWinner();

    // ============================================
    // Modifiers
    // ============================================

    modifier onlyOperator() {
        if (msg.sender != operator && msg.sender != owner()) revert OnlyOperator();
        _;
    }

    // ============================================
    // Constructor
    // ============================================

    constructor(
        address _emptours,
        address _tours,
        address _entropy,
        address _treasury
    ) Ownable(msg.sender) {
        require(_emptours != address(0), "Invalid EMPTOURS");
        require(_tours != address(0), "Invalid TOURS");
        require(_entropy != address(0), "Invalid Entropy");

        emptours = IERC20(_emptours);
        tours = IERC20(_tours);
        entropy = IEntropyV2(_entropy);
        entropyProvider = entropy.getDefaultProvider();
        treasury = _treasury;
        operator = msg.sender;

        // Start first round
        _startNewRound();
    }

    // ============================================
    // Core: Betting
    // ============================================

    /**
     * @notice Place a bet on the current round
     * @param prediction HEADS (0) or TAILS (1)
     * @param amount Amount of EMPTOURS to bet
     */
    function placeBet(Prediction prediction, uint256 amount) external nonReentrant {
        Round storage round = rounds[currentRoundId];

        if (round.status != RoundStatus.OPEN) revert RoundNotOpen();
        if (block.timestamp >= round.closesAt) revert BettingClosed();
        if (amount < MIN_BET || amount > MAX_BET) revert InvalidBetAmount();
        if (roundBetIndex[currentRoundId][msg.sender] != 0) revert AlreadyBet();

        // Transfer EMPTOURS from bettor
        emptours.safeTransferFrom(msg.sender, address(this), amount);

        // Record bet
        round.betCount++;
        uint256 betIndex = round.betCount;

        roundBets[currentRoundId][betIndex] = Bet({
            bettor: msg.sender,
            prediction: prediction,
            amount: amount,
            timestamp: block.timestamp,
            claimed: false
        });

        roundBetIndex[currentRoundId][msg.sender] = betIndex;

        // Update totals
        if (prediction == Prediction.HEADS) {
            round.totalHeads += amount;
        } else {
            round.totalTails += amount;
        }

        emit BetPlaced(currentRoundId, msg.sender, prediction, amount);
    }

    // ============================================
    // Core: Round Management
    // ============================================

    /**
     * @notice Close betting and request Pyth randomness
     * @dev Can be called by operator after betting window closes
     */
    function closeAndRequestRandomness() external payable onlyOperator nonReentrant {
        Round storage round = rounds[currentRoundId];

        if (round.status != RoundStatus.OPEN) revert RoundNotOpen();

        round.status = RoundStatus.CLOSED;
        emit RoundClosed(currentRoundId, round.totalHeads, round.totalTails, round.betCount);

        // If no bets, skip randomness and start new round
        if (round.betCount == 0) {
            round.status = RoundStatus.RESOLVED;
            round.resolvedAt = block.timestamp;
            _startNewRound();
            return;
        }

        // Request Pyth Entropy randomness
        uint256 fee = entropy.getFeeV2();
        require(msg.value >= fee, "Insufficient entropy fee");

        round.status = RoundStatus.RESOLVING;

        uint64 sequenceNumber = entropy.requestV2{value: fee}();

        round.entropySequence = sequenceNumber;
        emit RandomnessRequested(currentRoundId, sequenceNumber);

        // Refund excess ETH
        if (msg.value > fee) {
            (bool success, ) = msg.sender.call{value: msg.value - fee}("");
            require(success, "Refund failed");
        }
    }

    /**
     * @notice Pyth Entropy callback - receives random number
     * @dev Called by Pyth Entropy contract
     */
    function entropyCallback(
        uint64 sequenceNumber,
        address /* provider */,
        bytes32 randomNumber
    ) internal override {
        // Find the round with this sequence number
        Round storage round = rounds[currentRoundId];
        require(round.entropySequence == sequenceNumber, "Invalid sequence");
        require(round.status == RoundStatus.RESOLVING, "Not resolving");

        round.randomNumber = randomNumber;

        // Determine outcome: random % 2 -> 0 = HEADS, 1 = TAILS
        uint256 randomValue = uint256(randomNumber);
        round.result = (randomValue % 2 == 0) ? Prediction.HEADS : Prediction.TAILS;
        round.status = RoundStatus.RESOLVED;
        round.resolvedAt = block.timestamp;

        // Calculate consolation prizes for losers
        _calculateConsolationPrizes(currentRoundId, randomNumber);

        emit RoundResolved(currentRoundId, round.result, randomNumber);

        // Start next round
        _startNewRound();
    }

    /**
     * @notice Get the Entropy contract address (required by IEntropyConsumer)
     */
    function getEntropy() internal view override returns (address) {
        return address(entropy);
    }

    /**
     * @notice Start a new betting round
     */
    function _startNewRound() internal {
        currentRoundId++;

        rounds[currentRoundId] = Round({
            id: currentRoundId,
            status: RoundStatus.OPEN,
            startedAt: block.timestamp,
            closesAt: block.timestamp + ROUND_DURATION,
            totalHeads: 0,
            totalTails: 0,
            result: Prediction.HEADS,
            entropySequence: 0,
            randomNumber: bytes32(0),
            resolvedAt: 0,
            betCount: 0
        });

        emit RoundStarted(currentRoundId, rounds[currentRoundId].closesAt);
    }

    // ============================================
    // Core: Payouts
    // ============================================

    /**
     * @notice Claim winnings for a resolved round
     * @param roundId The round to claim from
     */
    function claimPayout(uint256 roundId) external nonReentrant {
        Round storage round = rounds[roundId];
        if (round.status != RoundStatus.RESOLVED) revert RoundNotResolved();

        uint256 betIndex = roundBetIndex[roundId][msg.sender];
        if (betIndex == 0) revert NoBetFound();

        Bet storage bet = roundBets[roundId][betIndex];
        if (bet.claimed) revert AlreadyClaimed();

        // Anti-flash loan: bet must have been placed MIN_STAKE_DURATION before resolution
        if (bet.timestamp + MIN_STAKE_DURATION > round.resolvedAt) revert StakeTooRecent();

        bet.claimed = true;

        // Check if winner
        if (bet.prediction == round.result) {
            // Winner: get bet back + share of losers' pool
            uint256 winningPool = (round.result == Prediction.HEADS) ? round.totalHeads : round.totalTails;
            uint256 losingPool = (round.result == Prediction.HEADS) ? round.totalTails : round.totalHeads;

            // Payout = bet + (bet / winningPool) * losingPool
            uint256 payout = bet.amount;
            if (winningPool > 0 && losingPool > 0) {
                uint256 share = (bet.amount * losingPool) / winningPool;
                payout += share;
            }

            emptours.safeTransfer(msg.sender, payout);
            emit PayoutClaimed(roundId, msg.sender, payout, true);
        } else {
            // Loser: nothing to claim here (use claimConsolation for TOURS)
            emit PayoutClaimed(roundId, msg.sender, 0, false);
        }
    }

    /**
     * @notice Claim TOURS consolation prize (for losers)
     * @param roundId The round to claim consolation from
     */
    function claimConsolation(uint256 roundId) external nonReentrant {
        Round storage round = rounds[roundId];
        if (round.status != RoundStatus.RESOLVED) revert RoundNotResolved();

        uint256 betIndex = roundBetIndex[roundId][msg.sender];
        if (betIndex == 0) revert NoBetFound();

        Bet storage bet = roundBets[roundId][betIndex];

        // Only losers get consolation
        if (bet.prediction == round.result) revert NotWinner();

        ConsolationPrize storage prize = consolationPrizes[roundId][msg.sender];
        if (prize.claimed) revert AlreadyClaimed();
        if (prize.amount == 0) revert NoBetFound();

        prize.claimed = true;

        // Transfer TOURS consolation
        tours.safeTransfer(msg.sender, prize.amount);
        emit ConsolationClaimed(roundId, msg.sender, prize.amount, prize.multiplier);
    }

    /**
     * @notice Calculate consolation prizes for all losers in a round
     * @dev Uses Pyth random number to derive deterministic but unpredictable multipliers
     */
    function _calculateConsolationPrizes(uint256 roundId, bytes32 randomNumber) internal {
        Round storage round = rounds[roundId];

        for (uint256 i = 1; i <= round.betCount; i++) {
            Bet storage bet = roundBets[roundId][i];

            // Only losers get consolation
            if (bet.prediction != round.result) {
                // Derive unique random for each loser from main random + their address
                bytes32 loserRandom = keccak256(abi.encodePacked(randomNumber, bet.bettor));
                uint8 multiplier = uint8((uint256(loserRandom) % MAX_CONSOLATION_MULTIPLIER) + 1);
                uint256 amount = CONSOLATION_BASE * multiplier;

                consolationPrizes[roundId][bet.bettor] = ConsolationPrize({
                    amount: amount,
                    multiplier: multiplier,
                    claimed: false
                });
            }
        }
    }

    // ============================================
    // View Functions
    // ============================================

    /**
     * @notice Get current round info
     */
    function getCurrentRound() external view returns (
        uint256 id,
        RoundStatus status,
        uint256 closesAt,
        uint256 totalHeads,
        uint256 totalTails,
        uint256 betCount
    ) {
        Round storage round = rounds[currentRoundId];
        return (
            round.id,
            round.status,
            round.closesAt,
            round.totalHeads,
            round.totalTails,
            round.betCount
        );
    }

    /**
     * @notice Get round result
     */
    function getRoundResult(uint256 roundId) external view returns (
        Prediction result,
        bytes32 randomNumber,
        uint256 resolvedAt
    ) {
        Round storage round = rounds[roundId];
        require(round.status == RoundStatus.RESOLVED, "Not resolved");
        return (round.result, round.randomNumber, round.resolvedAt);
    }

    /**
     * @notice Get bet info for an address in a round
     */
    function getBet(uint256 roundId, address bettor) external view returns (
        Prediction prediction,
        uint256 amount,
        uint256 timestamp,
        bool claimed
    ) {
        uint256 betIndex = roundBetIndex[roundId][bettor];
        require(betIndex > 0, "No bet found");

        Bet storage bet = roundBets[roundId][betIndex];
        return (bet.prediction, bet.amount, bet.timestamp, bet.claimed);
    }

    /**
     * @notice Get consolation prize info
     */
    function getConsolation(uint256 roundId, address bettor) external view returns (
        uint256 amount,
        uint8 multiplier,
        bool claimed
    ) {
        ConsolationPrize storage prize = consolationPrizes[roundId][bettor];
        return (prize.amount, prize.multiplier, prize.claimed);
    }

    /**
     * @notice Get Pyth Entropy fee
     */
    function getEntropyFee() external view returns (uint128) {
        return entropy.getFeeV2();
    }

    /**
     * @notice Calculate potential payout for a winning bet
     */
    function calculatePotentialPayout(uint256 roundId, address bettor) external view returns (uint256) {
        Round storage round = rounds[roundId];
        uint256 betIndex = roundBetIndex[roundId][bettor];
        if (betIndex == 0) return 0;

        Bet storage bet = roundBets[roundId][betIndex];

        uint256 myPool = (bet.prediction == Prediction.HEADS) ? round.totalHeads : round.totalTails;
        uint256 otherPool = (bet.prediction == Prediction.HEADS) ? round.totalTails : round.totalHeads;

        if (myPool == 0) return bet.amount;

        return bet.amount + (bet.amount * otherPool) / myPool;
    }

    /**
     * @notice Get all bets for a round
     */
    function getRoundBets(uint256 roundId) external view returns (
        address[] memory bettors,
        Prediction[] memory predictions,
        uint256[] memory amounts
    ) {
        Round storage round = rounds[roundId];
        uint256 count = round.betCount;

        bettors = new address[](count);
        predictions = new Prediction[](count);
        amounts = new uint256[](count);

        for (uint256 i = 1; i <= count; i++) {
            Bet storage bet = roundBets[roundId][i];
            bettors[i-1] = bet.bettor;
            predictions[i-1] = bet.prediction;
            amounts[i-1] = bet.amount;
        }

        return (bettors, predictions, amounts);
    }

    // ============================================
    // Admin Functions
    // ============================================

    function setOperator(address _operator) external onlyOwner {
        address old = operator;
        operator = _operator;
        emit OperatorUpdated(old, _operator);
    }

    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
    }

    function setEntropyProvider(address _provider) external onlyOwner {
        entropyProvider = _provider;
    }

    /**
     * @notice Emergency: Force resolve a stuck round
     */
    function emergencyResolve(uint256 roundId, Prediction result) external onlyOwner {
        Round storage round = rounds[roundId];
        require(round.status == RoundStatus.RESOLVING, "Not resolving");

        round.result = result;
        round.status = RoundStatus.RESOLVED;
        round.resolvedAt = block.timestamp;
        round.randomNumber = keccak256(abi.encodePacked(block.timestamp, result));

        _calculateConsolationPrizes(roundId, round.randomNumber);
        emit RoundResolved(roundId, result, round.randomNumber);

        if (roundId == currentRoundId) {
            _startNewRound();
        }
    }

    /**
     * @notice Emergency: Force start new round (if stuck)
     */
    function emergencyNewRound() external onlyOwner {
        Round storage round = rounds[currentRoundId];
        round.status = RoundStatus.RESOLVED;
        round.resolvedAt = block.timestamp;
        _startNewRound();
    }

    /**
     * @notice Fund contract with TOURS for consolation prizes
     */
    function fundConsolation(uint256 amount) external {
        tours.safeTransferFrom(msg.sender, address(this), amount);
    }

    /**
     * @notice Withdraw excess tokens (emergency)
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
    }

    /**
     * @notice Receive ETH for Pyth Entropy fees
     */
    receive() external payable {}
}
