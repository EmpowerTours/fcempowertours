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
 * @title DailyPassLotterySecure
 * @notice Fully on-chain daily lottery with secure COMMIT-REVEAL randomness
 * @author EmpowerTours
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
contract DailyPassLotterySecure is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============================================
    // Constants
    // ============================================
    uint256 public constant ENTRY_FEE = 1 ether; // 1 MON
    uint256 public constant PLATFORM_FEE_BPS = 1000; // 10%
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant REVEAL_DELAY = 10; // Blocks to wait
    uint256 public constant ESCROW_CLAIM_PERIOD = 7 days;
    uint256 public constant ROUND_DURATION = 24 hours;
    uint256 public constant CALLER_REWARD = 0.01 ether; // Reward for calling finalize

    // ============================================
    // Configuration
    // ============================================
    IshMON public shMonToken;
    address public platformWallet;
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
        address holder;
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
    mapping(uint256 => mapping(address => bool)) public hasEnteredRound;
    mapping(address => DailyPass[]) public userPasses;
    mapping(uint256 => Escrow) public escrows;
    mapping(address => uint256[]) public userWinnings;

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

        _startNewRound();
    }

    // ============================================
    // Entry Functions
    // ============================================

    /**
     * @notice Enter lottery with MON
     */
    function enterWithMon() external payable nonReentrant returns (uint256 entryIndex) {
        require(msg.value >= ENTRY_FEE, "Entry fee is 1 MON");

        // Lazy finalization: check if previous rounds need finalizing
        _lazyFinalizePreviousRounds();
        _checkAndRotateRound();

        require(rounds[currentRoundId].status == RoundStatus.Active, "Round not active");
        require(!hasEnteredRound[currentRoundId][msg.sender], "Already entered");

        DailyRound storage round = rounds[currentRoundId];

        uint256 platformFee = (msg.value * PLATFORM_FEE_BPS) / BASIS_POINTS;
        uint256 toPrizePool = msg.value - platformFee;

        round.prizePoolMon += toPrizePool;
        entryIndex = round.participantCount;
        round.participantCount++;

        roundParticipants[currentRoundId].push(msg.sender);
        hasEnteredRound[currentRoundId][msg.sender] = true;

        userPasses[msg.sender].push(DailyPass({
            roundId: currentRoundId,
            holder: msg.sender,
            entryTime: block.timestamp,
            paidWithShMon: false,
            entryIndex: entryIndex
        }));

        totalParticipants++;

        if (platformFee > 0) {
            (bool success, ) = platformWallet.call{value: platformFee}("");
            require(success, "Platform fee failed");
        }

        emit DailyPassPurchased(currentRoundId, msg.sender, entryIndex, false, msg.value);
        return entryIndex;
    }

    /**
     * @notice Enter lottery with shMON
     */
    function enterWithShMon(uint256 shMonAmount) external nonReentrant returns (uint256 entryIndex) {
        require(shMonEnabled, "shMON disabled");
        require(address(shMonToken) != address(0), "shMON not set");

        uint256 monEquivalent = shMonToken.convertToAssets(shMonAmount);
        require(monEquivalent >= ENTRY_FEE, "Insufficient shMON");

        // Lazy finalization
        _lazyFinalizePreviousRounds();
        _checkAndRotateRound();

        require(rounds[currentRoundId].status == RoundStatus.Active, "Round not active");
        require(!hasEnteredRound[currentRoundId][msg.sender], "Already entered");

        IERC20(address(shMonToken)).safeTransferFrom(msg.sender, address(this), shMonAmount);

        DailyRound storage round = rounds[currentRoundId];

        uint256 platformFee = (shMonAmount * PLATFORM_FEE_BPS) / BASIS_POINTS;
        uint256 toPrizePool = shMonAmount - platformFee;

        round.prizePoolShMon += toPrizePool;
        entryIndex = round.participantCount;
        round.participantCount++;

        roundParticipants[currentRoundId].push(msg.sender);
        hasEnteredRound[currentRoundId][msg.sender] = true;

        userPasses[msg.sender].push(DailyPass({
            roundId: currentRoundId,
            holder: msg.sender,
            entryTime: block.timestamp,
            paidWithShMon: true,
            entryIndex: entryIndex
        }));

        totalParticipants++;

        if (platformFee > 0) {
            IERC20(address(shMonToken)).safeTransfer(platformWallet, platformFee);
        }

        emit DailyPassPurchased(currentRoundId, msg.sender, entryIndex, true, shMonAmount);
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
    // Lazy Finalization (fallback)
    // ============================================

    /**
     * @dev Auto-finalize old rounds when someone enters new round
     */
    function _lazyFinalizePreviousRounds() internal {
        // Check last few rounds for pending finalization
        // Prevent underflow: calculate min round safely
        uint256 minRound = currentRoundId > 3 ? currentRoundId - 3 : 0;
        for (uint256 i = currentRoundId; i > minRound; i--) {
            DailyRound storage round = rounds[i];

            // Skip if no participants or already finalized
            if (round.participantCount == 0 || round.status == RoundStatus.Finalized) {
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
            (bool success, ) = platformWallet.call{value: esc.monAmount}("");
            require(success, "MON failed");
        }

        if (esc.shMonAmount > 0) {
            IERC20(address(shMonToken)).safeTransfer(platformWallet, esc.shMonAmount);
        }

        emit EscrowExpired(roundId);
    }

    // ============================================
    // Round Management
    // ============================================

    function _checkAndRotateRound() internal {
        DailyRound storage current = rounds[currentRoundId];
        if (block.timestamp >= current.endTime && current.status == RoundStatus.Active) {
            current.status = RoundStatus.CommitPending;
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
