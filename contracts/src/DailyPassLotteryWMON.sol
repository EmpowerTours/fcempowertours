// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@pythnetwork/entropy-sdk-solidity/IEntropyConsumer.sol";
import "@pythnetwork/entropy-sdk-solidity/IEntropyV2.sol";

/**
 * @notice WMON interface for unwrapping
 */
interface IWMON is IERC20 {
    function deposit() external payable;
    function withdraw(uint256) external;
}

/**
 * @title DailyPassLotteryWMON
 * @notice WMON-based lottery with Pyth Entropy for verifiable randomness
 * @author EmpowerTours
 *
 * === MAINNET VERSION ===
 * - Uses WMON (Wrapped MON) for all entries
 * - 1 WMON entrance fee
 * - Supports delegation (Oracle/Safe can pay for users)
 * - Pyth Entropy for secure, verifiable randomness
 *
 * === SECURITY: PYTH ENTROPY RANDOMNESS ===
 * - Request randomness via Pyth Entropy when round ends
 * - Callback-based: requestV2() → entropyCallback()
 * - Verifiable, tamper-proof random numbers
 * - Fee paid in native gas tokens (MON)
 *
 * === INCENTIVIZED FINALIZATION ===
 * - Anyone can call request functions and receive CALLER_REWARD
 * - Randomness resolution happens via Pyth Entropy callback
 *
 * === ESCROW PAYOUT ===
 * - Winner's prize held in escrow until claimed
 * - 7 day claim window
 * - Expired escrow returns to platform
 */
contract DailyPassLotteryWMON is Ownable, ReentrancyGuard, IEntropyConsumer {
    using SafeERC20 for IERC20;

    // ============================================
    // Constants
    // ============================================
    uint256 public constant ENTRY_FEE = 1 ether; // 1 WMON
    uint256 public constant PLATFORM_SAFE_FEE_BPS = 500; // 5%
    uint256 public constant PLATFORM_WALLET_FEE_BPS = 500; // 5%
    uint256 public constant PRIZE_POOL_BPS = 9000; // 90%
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant ESCROW_CLAIM_PERIOD = 7 days;
    uint256 public constant ROUND_DURATION = 24 hours;
    uint256 public constant MIN_REWARD_TOURS = 1 ether;    // 1 TOURS minimum
    uint256 public constant MAX_REWARD_TOURS = 1000 ether; // 1000 TOURS maximum

    // ============================================
    // Configuration
    // ============================================
    IERC20 public wmonToken;
    IERC20 public toursToken;
    IEntropyV2 public entropy;
    address public platformSafe;
    address public platformWallet;
    address public entropyProvider;

    // ============================================
    // Round State
    // ============================================
    enum RoundStatus {
        Active,           // Accepting entries
        RandomnessPending, // Waiting for randomness callback
        Finalized         // Winner selected
    }

    struct DailyRound {
        uint256 roundId;
        uint256 startTime;
        uint256 endTime;
        uint256 prizePoolWmon;
        uint256 participantCount;
        RoundStatus status;
        // Pyth Entropy randomness
        uint64 entropySequenceNumber;
        bytes32 randomValue;
        uint256 randomnessRequestedAt;
        // Winner
        address winner;
        uint256 winnerIndex;
        uint256 callerRewardsToursPaid;
    }

    struct DailyPass {
        uint256 roundId;
        uint256 userFid;        // User's Farcaster ID
        address beneficiary;
        uint256 entryTime;
        uint256 entryIndex;
    }

    struct Escrow {
        uint256 roundId;
        address winner;
        uint256 wmonAmount;
        uint256 createdAt;
        uint256 expiresAt;
        bool claimed;
    }

    // ============================================
    // Storage
    // ============================================
    uint256 public currentRoundId;

    mapping(uint256 => DailyRound) public rounds;
    mapping(uint256 => address[]) public roundParticipants;
    mapping(uint256 => mapping(address => bool)) public hasEnteredRound;
    mapping(address => DailyPass[]) public userPasses;
    mapping(uint256 => DailyPass[]) public fidPasses;  // FID => passes
    mapping(uint256 => Escrow) public escrows;
    mapping(address => uint256[]) public userWinnings;
    mapping(uint256 => uint256[]) public fidWinnings;  // FID => round IDs won

    // Mapping from Pyth Entropy sequence number to round ID
    mapping(uint64 => uint256) public sequenceToRound;
    // Mapping from sequence number to requester (for random reward payment)
    mapping(uint64 => address) public sequenceToRequester;

    uint256 public totalPrizesPaid;
    uint256 public totalParticipants;
    uint256 public platformSafeFeesCollected;
    uint256 public platformWalletFeesCollected;

    // ============================================
    // Events
    // ============================================
    event RoundStarted(uint256 indexed roundId, uint256 startTime, uint256 endTime);
    event DailyPassPurchased(
        uint256 indexed roundId,
        address indexed beneficiary,
        uint256 indexed userFid,
        address payer,
        uint256 entryIndex,
        uint256 amount
    );
    event RandomnessRequested(
        uint256 indexed roundId,
        uint64 indexed sequenceNumber,
        address indexed caller,
        uint256 reward,
        uint256 entropyFee
    );
    event WinnerRevealed(
        uint256 indexed roundId,
        address indexed winner,
        uint256 winnerIndex,
        bytes32 randomValue,
        uint256 wmonPrize
    );
    event PrizeClaimed(
        uint256 indexed roundId,
        address indexed winner,
        uint256 wmonAmount
    );
    event EscrowExpired(uint256 indexed roundId);
    event PlatformSafeFeeCollected(address indexed platformSafe, uint256 amount);
    event PlatformWalletFeeCollected(address indexed platformWallet, uint256 amount);

    // ============================================
    // Constructor
    // ============================================
    constructor(
        address _wmonToken,
        address _toursToken,
        address _entropy,
        address _platformSafe,
        address _platformWallet
    ) Ownable(msg.sender) {
        require(_wmonToken != address(0), "Invalid WMON");
        require(_toursToken != address(0), "Invalid TOURS");
        require(_entropy != address(0), "Invalid Entropy");
        require(_platformSafe != address(0), "Invalid platform safe");
        require(_platformWallet != address(0), "Invalid platform wallet");

        wmonToken = IERC20(_wmonToken);
        toursToken = IERC20(_toursToken);
        entropy = IEntropyV2(_entropy);
        platformSafe = _platformSafe;
        platformWallet = _platformWallet;

        // Get default entropy provider
        entropyProvider = entropy.getDefaultProvider();

        _startNewRound();
    }

    // ============================================
    // Entry Functions
    // ============================================

    /**
     * @notice Enter lottery with WMON for yourself
     * @param userFid User's Farcaster ID
     */
    function enterWithWMON(uint256 userFid) external nonReentrant returns (uint256 entryIndex) {
        return _enterWithWMON(msg.sender, userFid);
    }

    /**
     * @notice Enter lottery with WMON for another user (delegation support)
     * @param beneficiary The user who will be entered into the lottery
     * @param userFid User's Farcaster ID
     */
    function enterWithWMONFor(address beneficiary, uint256 userFid) external nonReentrant returns (uint256 entryIndex) {
        require(beneficiary != address(0), "Invalid beneficiary");
        return _enterWithWMON(beneficiary, userFid);
    }

    function _enterWithWMON(address beneficiary, uint256 userFid) internal returns (uint256 entryIndex) {
        require(userFid > 0, "Invalid FID");
        _lazyFinalizePreviousRounds();
        _checkAndRotateRound();

        require(rounds[currentRoundId].status == RoundStatus.Active, "Round not active");
        require(!hasEnteredRound[currentRoundId][beneficiary], "Already entered");

        // Transfer WMON from caller (supports delegation)
        wmonToken.safeTransferFrom(msg.sender, address(this), ENTRY_FEE);

        DailyRound storage round = rounds[currentRoundId];

        uint256 platformSafeFee = (ENTRY_FEE * PLATFORM_SAFE_FEE_BPS) / BASIS_POINTS;
        uint256 platformWalletFee = (ENTRY_FEE * PLATFORM_WALLET_FEE_BPS) / BASIS_POINTS;
        uint256 toPrizePool = ENTRY_FEE - platformSafeFee - platformWalletFee;

        round.prizePoolWmon += toPrizePool;
        entryIndex = round.participantCount;
        round.participantCount++;

        roundParticipants[currentRoundId].push(beneficiary);
        hasEnteredRound[currentRoundId][beneficiary] = true;

        DailyPass memory newPass = DailyPass({
            roundId: currentRoundId,
            userFid: userFid,
            beneficiary: beneficiary,
            entryTime: block.timestamp,
            entryIndex: entryIndex
        });

        userPasses[beneficiary].push(newPass);
        fidPasses[userFid].push(newPass);

        totalParticipants++;

        if (platformSafeFee > 0) {
            platformSafeFeesCollected += platformSafeFee;
            wmonToken.safeTransfer(platformSafe, platformSafeFee);
            emit PlatformSafeFeeCollected(platformSafe, platformSafeFee);
        }

        if (platformWalletFee > 0) {
            platformWalletFeesCollected += platformWalletFee;
            wmonToken.safeTransfer(platformWallet, platformWalletFee);
            emit PlatformWalletFeeCollected(platformWallet, platformWalletFee);
        }

        emit DailyPassPurchased(currentRoundId, beneficiary, userFid, msg.sender, entryIndex, ENTRY_FEE);
        return entryIndex;
    }

    // ============================================
    // Pyth Entropy Randomness
    // ============================================

    /**
     * @notice Request randomness when round ends (anyone can call, receives reward)
     * @param roundId The round to request randomness for
     *
     * Supports two payment methods:
     * 1. Direct MON payment (msg.value) - for EOA wallets
     * 2. WMON unwrapping - for Safe/delegation (no msg.value needed)
     */
    function requestRandomness(uint256 roundId) external payable nonReentrant {
        DailyRound storage round = rounds[roundId];

        require(round.status == RoundStatus.Active, "Round not active");
        require(block.timestamp >= round.endTime, "Round not ended");
        require(round.participantCount > 0, "No participants");
        require(round.entropySequenceNumber == 0, "Already requested");

        // Get required fee from Pyth Entropy
        uint256 fee = entropy.getFeeV2();

        uint64 sequenceNumber;

        // Option 1: Caller sent native MON (EOA/manual calls)
        if (msg.value >= fee) {
            // Request randomness with provided MON
            sequenceNumber = entropy.requestV2{value: fee}();

            // Refund excess payment
            if (msg.value > fee) {
                (bool success, ) = msg.sender.call{value: msg.value - fee}("");
                require(success, "Refund failed");
            }
        }
        // Option 2: Unwrap WMON to MON (Safe/delegation calls)
        else {
            // Check contract has enough WMON to unwrap
            uint256 wmonBalance = wmonToken.balanceOf(address(this));
            require(wmonBalance >= fee + round.prizePoolWmon, "Insufficient WMON for entropy fee");

            // Unwrap WMON to native MON
            IWMON(address(wmonToken)).withdraw(fee);

            // Request randomness with unwrapped MON
            sequenceNumber = entropy.requestV2{value: fee}();
        }

        round.entropySequenceNumber = sequenceNumber;
        round.status = RoundStatus.RandomnessPending;
        round.randomnessRequestedAt = block.timestamp;

        // Map sequence number to round ID and requester for callback
        sequenceToRound[sequenceNumber] = roundId;
        sequenceToRequester[sequenceNumber] = msg.sender;

        // Note: TOURS reward will be paid in callback with random amount (1-1000 TOURS)
        emit RandomnessRequested(roundId, sequenceNumber, msg.sender, 0, fee);
    }

    /**
     * @notice Pyth Entropy callback - automatically called when randomness is ready
     * @param sequenceNumber The sequence number from the request
     * @param provider The provider address
     * @param randomNumber The generated random number
     */
    function entropyCallback(
        uint64 sequenceNumber,
        address provider,
        bytes32 randomNumber
    ) internal override {
        uint256 roundId = sequenceToRound[sequenceNumber];
        require(roundId != 0, "Invalid sequence number");

        DailyRound storage round = rounds[roundId];
        require(round.status == RoundStatus.RandomnessPending, "Not pending");
        require(round.entropySequenceNumber == sequenceNumber, "Sequence mismatch");

        // Store random value
        round.randomValue = randomNumber;

        // Select winner using verifiable random value
        uint256 winnerIndex = uint256(randomNumber) % round.participantCount;
        address winner = roundParticipants[roundId][winnerIndex];

        round.winner = winner;
        round.winnerIndex = winnerIndex;
        round.status = RoundStatus.Finalized;

        // Calculate random TOURS reward (1-1000 TOURS) using entropy
        // Use upper 128 bits of randomNumber (lower bits used for winner selection above)
        uint256 rewardRange = MAX_REWARD_TOURS / 1 ether; // 1000
        uint256 rewardIndex = (uint256(randomNumber) >> 128) % rewardRange; // 0-999
        uint256 randomReward = MIN_REWARD_TOURS + rewardIndex * 1 ether; // 1-1000 TOURS

        // Pay the requester their random TOURS reward
        address requester = sequenceToRequester[sequenceNumber];
        uint256 toursBalance = toursToken.balanceOf(address(this));
        if (requester != address(0) && toursBalance >= randomReward) {
            round.callerRewardsToursPaid = randomReward;
            toursToken.safeTransfer(requester, randomReward);
        }

        // Create escrow (full prize pool, caller rewards are paid in TOURS)
        uint256 escrowWmonAmount = round.prizePoolWmon;

        escrows[roundId] = Escrow({
            roundId: roundId,
            winner: winner,
            wmonAmount: escrowWmonAmount,
            createdAt: block.timestamp,
            expiresAt: block.timestamp + ESCROW_CLAIM_PERIOD,
            claimed: false
        });

        userWinnings[winner].push(roundId);

        // Add to FID winnings if we can find the FID
        DailyPass[] memory passes = userPasses[winner];
        for (uint256 i = 0; i < passes.length; i++) {
            if (passes[i].roundId == roundId) {
                fidWinnings[passes[i].userFid].push(roundId);
                break;
            }
        }

        totalPrizesPaid += escrowWmonAmount;

        emit WinnerRevealed(
            roundId,
            winner,
            winnerIndex,
            randomNumber,
            escrowWmonAmount
        );
    }

    /**
     * @notice Required by IEntropyConsumer - returns the Entropy contract address
     */
    function getEntropy() internal view override returns (address) {
        return address(entropy);
    }

    // ============================================
    // Lazy Finalization
    // ============================================

    function _lazyFinalizePreviousRounds() internal {
        // Check last 5 rounds for any that need auto-finalization
        uint256 minRound = currentRoundId > 5 ? currentRoundId - 5 : 0;

        for (uint256 i = currentRoundId; i > minRound; i--) {
            DailyRound storage round = rounds[i];

            if (round.participantCount == 0 || round.status == RoundStatus.Finalized) {
                continue;
            }

            if (i == currentRoundId && block.timestamp < round.endTime) {
                continue;
            }

            // Note: We don't auto-request randomness here since it requires payment
            // Rounds must be manually triggered by calling requestRandomness()
        }
    }

    // ============================================
    // Escrow & Claims
    // ============================================

    /**
     * @notice Claim prize for yourself
     */
    function claimPrize(uint256 roundId) external nonReentrant {
        _claimPrize(msg.sender, roundId);
    }

    /**
     * @notice Claim prize for another user (delegation support)
     */
    function claimPrizeFor(address beneficiary, uint256 roundId) external nonReentrant {
        require(beneficiary != address(0), "Invalid beneficiary");
        _claimPrize(beneficiary, roundId);
    }

    function _claimPrize(address beneficiary, uint256 roundId) internal {
        Escrow storage esc = escrows[roundId];

        require(esc.winner == beneficiary, "Not winner");
        require(!esc.claimed, "Already claimed");
        require(block.timestamp <= esc.expiresAt, "Expired");

        esc.claimed = true;

        if (esc.wmonAmount > 0) {
            wmonToken.safeTransfer(beneficiary, esc.wmonAmount);
        }

        emit PrizeClaimed(roundId, beneficiary, esc.wmonAmount);

        _checkAndRotateRound();
    }

    /**
     * @notice Reclaim expired escrow (only owner)
     */
    function reclaimExpiredEscrow(uint256 roundId) external onlyOwner nonReentrant {
        Escrow storage esc = escrows[roundId];

        require(!esc.claimed, "Already claimed");
        require(block.timestamp > esc.expiresAt, "Not expired");

        esc.claimed = true;

        if (esc.wmonAmount > 0) {
            wmonToken.safeTransfer(platformSafe, esc.wmonAmount);
        }

        emit EscrowExpired(roundId);

        _checkAndRotateRound();
    }

    // ============================================
    // Round Management
    // ============================================

    function _checkAndRotateRound() internal {
        DailyRound storage current = rounds[currentRoundId];

        if (block.timestamp >= current.endTime) {
            if (current.participantCount > 0 && current.status != RoundStatus.Finalized) {
                // Round ended but not finalized - leave it pending
                // Will be finalized when someone calls requestRandomness()
            }

            _startNewRound();
        }
    }

    function _startNewRound() internal {
        currentRoundId++;

        rounds[currentRoundId] = DailyRound({
            roundId: currentRoundId,
            startTime: block.timestamp,
            endTime: block.timestamp + ROUND_DURATION,
            prizePoolWmon: 0,
            participantCount: 0,
            status: RoundStatus.Active,
            entropySequenceNumber: 0,
            randomValue: bytes32(0),
            randomnessRequestedAt: 0,
            winner: address(0),
            winnerIndex: 0,
            callerRewardsToursPaid: 0
        });

        emit RoundStarted(currentRoundId, block.timestamp, block.timestamp + ROUND_DURATION);
    }

    /**
     * @notice Force start a new round (emergency only)
     */
    function forceNewRound() external onlyOwner {
        rounds[currentRoundId].status = RoundStatus.RandomnessPending;
        _startNewRound();
    }

    /**
     * @notice Force end current round (emergency only)
     */
    function forceEndRound() external onlyOwner {
        rounds[currentRoundId].endTime = block.timestamp;
    }

    // ============================================
    // View Functions
    // ============================================

    function getCurrentRound() external view returns (DailyRound memory) {
        return rounds[currentRoundId];
    }

    function getRound(uint256 roundId) external view returns (DailyRound memory) {
        return rounds[roundId];
    }

    function hasEnteredToday(address user) external view returns (bool) {
        return hasEnteredRound[currentRoundId][user];
    }

    function getUserPasses(address user) external view returns (DailyPass[] memory) {
        return userPasses[user];
    }

    function getRoundParticipants(uint256 roundId) external view returns (address[] memory) {
        return roundParticipants[roundId];
    }

    function getEscrow(uint256 roundId) external view returns (Escrow memory) {
        return escrows[roundId];
    }

    function getUserWinnings(address user) external view returns (uint256[] memory) {
        return userWinnings[user];
    }

    function getFidPasses(uint256 fid) external view returns (DailyPass[] memory) {
        return fidPasses[fid];
    }

    function getFidWinnings(uint256 fid) external view returns (uint256[] memory) {
        return fidWinnings[fid];
    }

    function getTimeRemaining() external view returns (uint256) {
        if (block.timestamp >= rounds[currentRoundId].endTime) return 0;
        return rounds[currentRoundId].endTime - block.timestamp;
    }

    function canRequestRandomness(uint256 roundId) external view returns (bool) {
        DailyRound memory r = rounds[roundId];
        return r.status == RoundStatus.Active
            && block.timestamp >= r.endTime
            && r.participantCount > 0
            && r.entropySequenceNumber == 0;
    }

    function getEntropyFee() external view returns (uint256) {
        return entropy.getFeeV2();
    }

    function getStats() external view returns (
        uint256 _currentRoundId,
        uint256 _prizePoolWmon,
        uint256 _participants,
        uint256 _totalPaid,
        uint256 _totalParticipants,
        RoundStatus _status
    ) {
        DailyRound memory r = rounds[currentRoundId];
        return (
            currentRoundId,
            r.prizePoolWmon,
            r.participantCount,
            totalPrizesPaid,
            totalParticipants,
            r.status
        );
    }

    // ============================================
    // Admin
    // ============================================

    function setPlatformSafe(address _safe) external onlyOwner {
        require(_safe != address(0), "Invalid address");
        platformSafe = _safe;
    }

    function setPlatformWallet(address _wallet) external onlyOwner {
        require(_wallet != address(0), "Invalid address");
        platformWallet = _wallet;
    }

    function setEntropyProvider(address _provider) external onlyOwner {
        require(_provider != address(0), "Invalid provider");
        entropyProvider = _provider;
    }

    /**
     * @notice Fund contract with TOURS for caller rewards
     */
    function fundRewards(uint256 amount) external onlyOwner {
        toursToken.safeTransferFrom(msg.sender, address(this), amount);
    }

    /**
     * @notice Emergency withdraw (only withdraws excess, not active prize pools)
     */
    function emergencyWithdraw() external onlyOwner {
        // Calculate total active prize pools and escrows
        uint256 reservedWmon = 0;

        // Add current round prize pool
        reservedWmon += rounds[currentRoundId].prizePoolWmon;

        // Add unclaimed escrows from last 10 rounds
        uint256 minRound = currentRoundId > 10 ? currentRoundId - 10 : 0;
        for (uint256 i = currentRoundId; i > minRound; i--) {
            if (!escrows[i].claimed && escrows[i].wmonAmount > 0) {
                reservedWmon += escrows[i].wmonAmount;
            }
        }

        uint256 wmonBalance = wmonToken.balanceOf(address(this));
        if (wmonBalance > reservedWmon) {
            uint256 excess = wmonBalance - reservedWmon;
            wmonToken.safeTransfer(owner(), excess);
        }

        // Withdraw any native tokens (entropy fees)
        uint256 nativeBalance = address(this).balance;
        if (nativeBalance > 0) {
            (bool success, ) = owner().call{value: nativeBalance}("");
            require(success, "Native transfer failed");
        }
    }

    receive() external payable {}
}
