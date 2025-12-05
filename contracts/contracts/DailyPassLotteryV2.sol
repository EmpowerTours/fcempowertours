// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title IshMON
 * @notice Interface for shMONAD liquid staking token (ERC4626)
 * @dev Testnet: 0x3a98250F98Dd388C211206983453837C8365BDc1
 * @dev Mainnet: 0x1B68626dCa36c7fE922fD2d55E4f631d962dE19c
 */
interface IshMON is IERC20 {
    function convertToAssets(uint256 shares) external view returns (uint256);
    function convertToShares(uint256 assets) external view returns (uint256);
}

/**
 * @title DailyPassLotteryV2
 * @notice Fully on-chain daily lottery with DELEGATION SUPPORT
 * @author EmpowerTours
 *
 * === V2 IMPROVEMENTS ===
 * - Delegation support via enterWithMonFor(beneficiary) and enterWithShMonFor(beneficiary)
 * - Dual-fee structure: 5% Platform Safe (gas) + 5% Platform Wallet (treasury) + 90% Prize Pool
 * - Fixed round rotation: prevents rounds from getting stuck
 * - Automatic round progression in lazy finalization
 *
 * === SECURITY: COMMIT-REVEAL SCHEME ===
 * - Phase 1 (COMMIT): Record blockhash when round ends
 * - Phase 2 (REVEAL): Use future blockhash (10 blocks later) for randomness
 * - Validator would need to control 10+ consecutive blocks to cheat
 *
 * === INCENTIVIZED FINALIZATION ===
 * - Anyone can call finalize functions and receive CALLER_REWARD
 * - If no one calls, next entry triggers lazy finalization (fallback)
 *
 * === ESCROW PAYOUT ===
 * - Winner's prize held in escrow until claimed
 * - 7 day claim window
 * - Expired escrow returns to platform
 */
contract DailyPassLotteryV2 is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============================================
    // Constants
    // ============================================
    uint256 public constant ENTRY_FEE = 1 ether; // 1 MON
    uint256 public constant PLATFORM_SAFE_FEE_BPS = 500; // 5% to Platform Safe (gas funding)
    uint256 public constant PLATFORM_WALLET_FEE_BPS = 500; // 5% to Platform Wallet (treasury)
    uint256 public constant PRIZE_POOL_BPS = 9000; // 90% to prize pool
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant REVEAL_DELAY = 10; // Blocks to wait
    uint256 public constant ESCROW_CLAIM_PERIOD = 7 days;
    uint256 public constant ROUND_DURATION = 24 hours;
    uint256 public constant CALLER_REWARD = 0.01 ether; // Reward for calling finalize

    // ============================================
    // Configuration
    // ============================================
    IshMON public shMonToken;
    address public platformSafe; // Receives 5% of fees for gas funding
    address public platformWallet; // Receives 5% of fees for treasury
    bool public shMonEnabled;

    // ============================================
    // Round State
    // ============================================
    enum RoundStatus {
        Active,         // Accepting entries
        CommitPending,  // Round ended, waiting for commit
        RevealPending,  // Committed, waiting for reveal
        Finalized       // Winner selected
    }

    struct DailyRound {
        uint256 roundId;
        uint256 startTime;
        uint256 endTime;
        uint256 prizePoolMon;
        uint256 prizePoolShMon;
        uint256 participantCount;
        RoundStatus status;
        // Commit-reveal
        uint256 commitBlock;
        bytes32 commitHash;
        // Winner
        address winner;
        uint256 winnerIndex;
    }

    struct DailyPass {
        uint256 roundId;
        address beneficiary; // Who the entry is for (not msg.sender)
        uint256 entryTime;
        bool paidWithShMon;
        uint256 entryIndex;
    }

    struct Escrow {
        uint256 roundId;
        address winner;
        uint256 monAmount;
        uint256 shMonAmount;
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
    mapping(uint256 => mapping(address => bool)) public hasEnteredRound; // beneficiary => has entered
    mapping(address => DailyPass[]) public userPasses;
    mapping(uint256 => Escrow) public escrows;
    mapping(address => uint256[]) public userWinnings;

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
        address indexed payer,
        uint256 entryIndex,
        bool paidWithShMon,
        uint256 amount
    );
    event RandomnessCommitted(
        uint256 indexed roundId,
        uint256 commitBlock,
        bytes32 commitHash,
        address indexed caller,
        uint256 reward
    );
    event WinnerRevealed(
        uint256 indexed roundId,
        address indexed winner,
        uint256 winnerIndex,
        uint256 monPrize,
        uint256 shMonPrize,
        address indexed caller,
        uint256 reward
    );
    event PrizeClaimed(
        uint256 indexed roundId,
        address indexed winner,
        uint256 monAmount,
        uint256 shMonAmount
    );
    event EscrowExpired(uint256 indexed roundId);
    event PlatformSafeFeeCollected(address indexed platformSafe, uint256 amount);
    event PlatformWalletFeeCollected(address indexed platformWallet, uint256 amount);

    // ============================================
    // Constructor
    // ============================================
    constructor(
        address _platformSafe,
        address _platformWallet,
        address _shMonToken
    ) Ownable(msg.sender) {
        require(_platformSafe != address(0), "Invalid platform safe");
        require(_platformWallet != address(0), "Invalid platform wallet");

        platformSafe = _platformSafe;
        platformWallet = _platformWallet;

        if (_shMonToken != address(0)) {
            shMonToken = IshMON(_shMonToken);
            shMonEnabled = true;
        }

        _startNewRound();
    }

    // ============================================
    // Entry Functions - WITH DELEGATION SUPPORT
    // ============================================

    /**
     * @notice Enter lottery with MON (self-entry)
     */
    function enterWithMon() external payable nonReentrant returns (uint256 entryIndex) {
        return _enterWithMon(msg.sender);
    }

    /**
     * @notice Enter lottery with MON for a beneficiary (delegation support)
     * @param beneficiary The address that will be entered and can win
     */
    function enterWithMonFor(address beneficiary) external payable nonReentrant returns (uint256 entryIndex) {
        require(beneficiary != address(0), "Invalid beneficiary");
        return _enterWithMon(beneficiary);
    }

    /**
     * @dev Internal logic for MON entry
     */
    function _enterWithMon(address beneficiary) internal returns (uint256 entryIndex) {
        require(msg.value >= ENTRY_FEE, "Entry fee is 1 MON");

        // Lazy finalization: check if previous rounds need finalizing
        _lazyFinalizePreviousRounds();

        // Check and rotate if needed (FIXED ROTATION LOGIC)
        _checkAndRotateRound();

        require(rounds[currentRoundId].status == RoundStatus.Active, "Round not active");
        require(!hasEnteredRound[currentRoundId][beneficiary], "Already entered");

        DailyRound storage round = rounds[currentRoundId];

        // Split fees: 5% Platform Safe, 5% Platform Wallet, 90% prize pool
        uint256 platformSafeFee = (msg.value * PLATFORM_SAFE_FEE_BPS) / BASIS_POINTS;
        uint256 platformWalletFee = (msg.value * PLATFORM_WALLET_FEE_BPS) / BASIS_POINTS;
        uint256 toPrizePool = msg.value - platformSafeFee - platformWalletFee;

        round.prizePoolMon += toPrizePool;
        entryIndex = round.participantCount;
        round.participantCount++;

        roundParticipants[currentRoundId].push(beneficiary);
        hasEnteredRound[currentRoundId][beneficiary] = true;

        userPasses[beneficiary].push(DailyPass({
            roundId: currentRoundId,
            beneficiary: beneficiary,
            entryTime: block.timestamp,
            paidWithShMon: false,
            entryIndex: entryIndex
        }));

        totalParticipants++;

        // Send Platform Safe fee for gas funding
        if (platformSafeFee > 0) {
            platformSafeFeesCollected += platformSafeFee;
            (bool success, ) = platformSafe.call{value: platformSafeFee}("");
            require(success, "Platform Safe fee failed");
            emit PlatformSafeFeeCollected(platformSafe, platformSafeFee);
        }

        // Send Platform Wallet fee for treasury
        if (platformWalletFee > 0) {
            platformWalletFeesCollected += platformWalletFee;
            (bool success, ) = platformWallet.call{value: platformWalletFee}("");
            require(success, "Platform Wallet fee failed");
            emit PlatformWalletFeeCollected(platformWallet, platformWalletFee);
        }

        emit DailyPassPurchased(currentRoundId, beneficiary, msg.sender, entryIndex, false, msg.value);
        return entryIndex;
    }

    /**
     * @notice Enter lottery with shMON (self-entry)
     */
    function enterWithShMon(uint256 shMonAmount) external nonReentrant returns (uint256 entryIndex) {
        return _enterWithShMon(msg.sender, shMonAmount);
    }

    /**
     * @notice Enter lottery with shMON for a beneficiary (delegation support)
     * @param beneficiary The address that will be entered and can win
     * @param shMonAmount Amount of shMON to use for entry
     */
    function enterWithShMonFor(address beneficiary, uint256 shMonAmount) external nonReentrant returns (uint256 entryIndex) {
        require(beneficiary != address(0), "Invalid beneficiary");
        return _enterWithShMon(beneficiary, shMonAmount);
    }

    /**
     * @dev Internal logic for shMON entry
     */
    function _enterWithShMon(address beneficiary, uint256 shMonAmount) internal returns (uint256 entryIndex) {
        require(shMonEnabled, "shMON disabled");
        require(address(shMonToken) != address(0), "shMON not set");

        uint256 monEquivalent = shMonToken.convertToAssets(shMonAmount);
        require(monEquivalent >= ENTRY_FEE, "Insufficient shMON");

        // Lazy finalization
        _lazyFinalizePreviousRounds();
        _checkAndRotateRound();

        require(rounds[currentRoundId].status == RoundStatus.Active, "Round not active");
        require(!hasEnteredRound[currentRoundId][beneficiary], "Already entered");

        IERC20(address(shMonToken)).safeTransferFrom(msg.sender, address(this), shMonAmount);

        DailyRound storage round = rounds[currentRoundId];

        // Split fees: 5% Platform Safe, 5% Platform Wallet, 90% prize pool
        uint256 platformSafeFee = (shMonAmount * PLATFORM_SAFE_FEE_BPS) / BASIS_POINTS;
        uint256 platformWalletFee = (shMonAmount * PLATFORM_WALLET_FEE_BPS) / BASIS_POINTS;
        uint256 toPrizePool = shMonAmount - platformSafeFee - platformWalletFee;

        round.prizePoolShMon += toPrizePool;
        entryIndex = round.participantCount;
        round.participantCount++;

        roundParticipants[currentRoundId].push(beneficiary);
        hasEnteredRound[currentRoundId][beneficiary] = true;

        userPasses[beneficiary].push(DailyPass({
            roundId: currentRoundId,
            beneficiary: beneficiary,
            entryTime: block.timestamp,
            paidWithShMon: true,
            entryIndex: entryIndex
        }));

        totalParticipants++;

        // Send Platform Safe fee for gas funding
        if (platformSafeFee > 0) {
            IERC20(address(shMonToken)).safeTransfer(platformSafe, platformSafeFee);
            platformSafeFeesCollected += platformSafeFee; // Note: tracks MON equivalent value
            emit PlatformSafeFeeCollected(platformSafe, platformSafeFee);
        }

        // Send Platform Wallet fee for treasury
        if (platformWalletFee > 0) {
            IERC20(address(shMonToken)).safeTransfer(platformWallet, platformWalletFee);
            platformWalletFeesCollected += platformWalletFee; // Note: tracks MON equivalent value
            emit PlatformWalletFeeCollected(platformWallet, platformWalletFee);
        }

        emit DailyPassPurchased(currentRoundId, beneficiary, msg.sender, entryIndex, true, shMonAmount);
        return entryIndex;
    }

    /**
     * @notice Get shMON entry fee
     */
    function getShMonEntryFee() external view returns (uint256) {
        if (address(shMonToken) == address(0)) return 0;
        return shMonToken.convertToShares(ENTRY_FEE);
    }

    // ============================================
    // Incentivized Commit-Reveal (with rewards)
    // ============================================

    /**
     * @notice COMMIT: Anyone can call, receives reward
     * @param roundId The round to commit
     */
    function commitRandomness(uint256 roundId) external nonReentrant {
        DailyRound storage round = rounds[roundId];

        require(
            round.status == RoundStatus.Active || round.status == RoundStatus.CommitPending,
            "Cannot commit"
        );
        require(block.timestamp >= round.endTime, "Round not ended");
        require(round.participantCount > 0, "No participants");
        require(round.commitBlock == 0, "Already committed");

        // Update status
        round.status = RoundStatus.RevealPending;
        round.commitBlock = block.number;
        round.commitHash = keccak256(abi.encodePacked(
            blockhash(block.number - 1),
            round.participantCount,
            roundId,
            address(this)
        ));

        // Pay caller reward (if contract has balance)
        uint256 reward = 0;
        if (address(this).balance >= CALLER_REWARD) {
            reward = CALLER_REWARD;
            (bool success, ) = msg.sender.call{value: reward}("");
            if (!success) reward = 0; // Don't revert, just skip reward
        }

        emit RandomnessCommitted(roundId, round.commitBlock, round.commitHash, msg.sender, reward);
    }

    /**
     * @notice REVEAL: Anyone can call after delay, receives reward
     * @param roundId The round to reveal
     */
    function revealWinner(uint256 roundId) external nonReentrant {
        DailyRound storage round = rounds[roundId];

        require(round.status == RoundStatus.RevealPending, "Not ready");
        require(block.number >= round.commitBlock + REVEAL_DELAY, "Wait for delay");

        // Get future blockhash
        bytes32 revealBlockHash = blockhash(round.commitBlock + REVEAL_DELAY);
        if (revealBlockHash == bytes32(0)) {
            // Fallback if too old (>256 blocks)
            revealBlockHash = blockhash(block.number - 1);
        }

        // Final randomness
        bytes32 randomHash = keccak256(abi.encodePacked(
            round.commitHash,
            revealBlockHash,
            roundId
        ));

        // Select winner
        uint256 winnerIndex = uint256(randomHash) % round.participantCount;
        address winner = roundParticipants[roundId][winnerIndex];

        // Finalize
        round.winner = winner;
        round.winnerIndex = winnerIndex;
        round.status = RoundStatus.Finalized;

        // Create escrow
        escrows[roundId] = Escrow({
            roundId: roundId,
            winner: winner,
            monAmount: round.prizePoolMon,
            shMonAmount: round.prizePoolShMon,
            createdAt: block.timestamp,
            expiresAt: block.timestamp + ESCROW_CLAIM_PERIOD,
            claimed: false
        });

        userWinnings[winner].push(roundId);
        totalPrizesPaid += round.prizePoolMon;

        // Pay caller reward
        uint256 reward = 0;
        if (address(this).balance >= CALLER_REWARD) {
            reward = CALLER_REWARD;
            (bool success, ) = msg.sender.call{value: reward}("");
            if (!success) reward = 0;
        }

        emit WinnerRevealed(
            roundId, winner, winnerIndex,
            round.prizePoolMon, round.prizePoolShMon,
            msg.sender, reward
        );
    }

    // ============================================
    // Lazy Finalization (fallback) - IMPROVED
    // ============================================

    /**
     * @dev Auto-finalize old rounds when someone enters new round
     * IMPROVED: Handles ALL pending rounds and ensures new round starts
     */
    function _lazyFinalizePreviousRounds() internal {
        // Check last few rounds for pending finalization
        uint256 minRound = currentRoundId > 5 ? currentRoundId - 5 : 0;

        for (uint256 i = currentRoundId; i > minRound; i--) {
            DailyRound storage round = rounds[i];

            // Skip if no participants or already finalized
            if (round.participantCount == 0 || round.status == RoundStatus.Finalized) {
                continue;
            }

            // Skip current round if it hasn't ended yet
            if (i == currentRoundId && block.timestamp < round.endTime) {
                continue;
            }

            // Auto-commit if pending
            if (round.status == RoundStatus.Active || round.status == RoundStatus.CommitPending) {
                if (block.timestamp >= round.endTime && round.commitBlock == 0) {
                    round.status = RoundStatus.RevealPending;
                    round.commitBlock = block.number;
                    round.commitHash = keccak256(abi.encodePacked(
                        blockhash(block.number - 1),
                        round.participantCount,
                        i,
                        address(this)
                    ));
                    emit RandomnessCommitted(i, round.commitBlock, round.commitHash, address(this), 0);
                }
            }

            // Auto-reveal if ready
            if (round.status == RoundStatus.RevealPending) {
                if (block.number >= round.commitBlock + REVEAL_DELAY) {
                    _autoReveal(i);
                }
            }
        }
    }

    /**
     * @dev Internal reveal for lazy finalization
     */
    function _autoReveal(uint256 roundId) internal {
        DailyRound storage round = rounds[roundId];

        bytes32 revealBlockHash = blockhash(round.commitBlock + REVEAL_DELAY);
        if (revealBlockHash == bytes32(0)) {
            revealBlockHash = blockhash(block.number - 1);
        }

        bytes32 randomHash = keccak256(abi.encodePacked(
            round.commitHash,
            revealBlockHash,
            roundId
        ));

        uint256 winnerIndex = uint256(randomHash) % round.participantCount;
        address winner = roundParticipants[roundId][winnerIndex];

        round.winner = winner;
        round.winnerIndex = winnerIndex;
        round.status = RoundStatus.Finalized;

        escrows[roundId] = Escrow({
            roundId: roundId,
            winner: winner,
            monAmount: round.prizePoolMon,
            shMonAmount: round.prizePoolShMon,
            createdAt: block.timestamp,
            expiresAt: block.timestamp + ESCROW_CLAIM_PERIOD,
            claimed: false
        });

        userWinnings[winner].push(roundId);
        totalPrizesPaid += round.prizePoolMon;

        emit WinnerRevealed(
            roundId, winner, winnerIndex,
            round.prizePoolMon, round.prizePoolShMon,
            address(this), 0
        );
    }

    // ============================================
    // Escrow & Claims
    // ============================================

    /**
     * @notice Winner claims prize
     */
    function claimPrize(uint256 roundId) external nonReentrant {
        Escrow storage esc = escrows[roundId];

        require(esc.winner == msg.sender, "Not winner");
        require(!esc.claimed, "Already claimed");
        require(block.timestamp <= esc.expiresAt, "Expired");

        esc.claimed = true;

        if (esc.monAmount > 0) {
            (bool success, ) = msg.sender.call{value: esc.monAmount}("");
            require(success, "MON failed");
        }

        if (esc.shMonAmount > 0) {
            IERC20(address(shMonToken)).safeTransfer(msg.sender, esc.shMonAmount);
        }

        emit PrizeClaimed(roundId, msg.sender, esc.monAmount, esc.shMonAmount);
    }

    /**
     * @notice Reclaim expired escrow
     */
    function reclaimExpiredEscrow(uint256 roundId) external onlyOwner nonReentrant {
        Escrow storage esc = escrows[roundId];

        require(!esc.claimed, "Claimed");
        require(block.timestamp > esc.expiresAt, "Not expired");

        esc.claimed = true;

        if (esc.monAmount > 0) {
            (bool success, ) = platformSafe.call{value: esc.monAmount}("");
            require(success, "MON failed");
        }

        if (esc.shMonAmount > 0) {
            IERC20(address(shMonToken)).safeTransfer(platformSafe, esc.shMonAmount);
        }

        emit EscrowExpired(roundId);
    }

    // ============================================
    // Round Management - IMPROVED ROTATION
    // ============================================

    /**
     * @dev IMPROVED: Always creates new round if current ended
     */
    function _checkAndRotateRound() internal {
        DailyRound storage current = rounds[currentRoundId];

        // If current round has ended, start a new one
        if (block.timestamp >= current.endTime) {
            // Mark current as pending commit (if it has participants and isn't finalized)
            if (current.participantCount > 0 && current.status != RoundStatus.Finalized) {
                current.status = RoundStatus.CommitPending;
            }

            // Start new round
            _startNewRound();
        }
    }

    function _startNewRound() internal {
        currentRoundId++;

        rounds[currentRoundId] = DailyRound({
            roundId: currentRoundId,
            startTime: block.timestamp,
            endTime: block.timestamp + ROUND_DURATION,
            prizePoolMon: 0,
            prizePoolShMon: 0,
            participantCount: 0,
            status: RoundStatus.Active,
            commitBlock: 0,
            commitHash: bytes32(0),
            winner: address(0),
            winnerIndex: 0
        });

        emit RoundStarted(currentRoundId, block.timestamp, block.timestamp + ROUND_DURATION);
    }

    function forceNewRound() external onlyOwner {
        rounds[currentRoundId].status = RoundStatus.CommitPending;
        _startNewRound();
    }

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

    function getTimeRemaining() external view returns (uint256) {
        if (block.timestamp >= rounds[currentRoundId].endTime) return 0;
        return rounds[currentRoundId].endTime - block.timestamp;
    }

    function canCommit(uint256 roundId) external view returns (bool) {
        DailyRound memory r = rounds[roundId];
        return (r.status == RoundStatus.Active || r.status == RoundStatus.CommitPending)
            && block.timestamp >= r.endTime
            && r.participantCount > 0
            && r.commitBlock == 0;
    }

    function canReveal(uint256 roundId) external view returns (bool) {
        DailyRound memory r = rounds[roundId];
        return r.status == RoundStatus.RevealPending
            && block.number >= r.commitBlock + REVEAL_DELAY;
    }

    function getStats() external view returns (
        uint256 _currentRoundId,
        uint256 _prizePoolMon,
        uint256 _prizePoolShMon,
        uint256 _participants,
        uint256 _totalPaid,
        uint256 _totalParticipants,
        RoundStatus _status
    ) {
        DailyRound memory r = rounds[currentRoundId];
        return (currentRoundId, r.prizePoolMon, r.prizePoolShMon, r.participantCount, totalPrizesPaid, totalParticipants, r.status);
    }

    // ============================================
    // Admin
    // ============================================

    function setShMonToken(address _t) external onlyOwner {
        shMonToken = IshMON(_t);
    }

    function toggleShMon(bool e) external onlyOwner {
        shMonEnabled = e;
    }

    function setPlatformSafe(address _w) external onlyOwner {
        require(_w != address(0), "Invalid");
        platformSafe = _w;
    }

    function setPlatformWallet(address _w) external onlyOwner {
        require(_w != address(0), "Invalid");
        platformWallet = _w;
    }

    function fundRewards() external payable onlyOwner {}

    function emergencyWithdraw() external onlyOwner {
        uint256 b = address(this).balance;
        if (b > 0) { (bool s,) = owner().call{value: b}(""); require(s); }
        if (address(shMonToken) != address(0)) {
            uint256 sb = shMonToken.balanceOf(address(this));
            if (sb > 0) IERC20(address(shMonToken)).safeTransfer(owner(), sb);
        }
    }

    receive() external payable {}
}
