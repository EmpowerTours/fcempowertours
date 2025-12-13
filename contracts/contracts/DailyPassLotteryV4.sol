// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SwitchboardTypes} from "@switchboard-xyz/on-demand-solidity/libraries/SwitchboardTypes.sol";
import {ISwitchboard} from "@switchboard-xyz/on-demand-solidity/interfaces/ISwitchboard.sol";

/**
 * @title IshMON
 * @notice Interface for shMONAD liquid staking token (ERC4626)
 */
interface IshMON is IERC20 {
    function convertToAssets(uint256 shares) external view returns (uint256);
    function convertToShares(uint256 assets) external view returns (uint256);
}

/**
 * @title DailyPassLotteryV4
 * @notice Fully on-chain daily lottery with SWITCHBOARD VERIFIABLE RANDOMNESS
 * @author EmpowerTours
 *
 * === V4 IMPROVEMENTS ===
 * - SECURE RANDOMNESS: Uses Switchboard oracles instead of blockhash
 * - No more validator manipulation vulnerability
 * - Verifiable, tamper-proof random numbers
 * - Off-chain resolution with on-chain verification
 *
 * === SECURITY: SWITCHBOARD RANDOMNESS ===
 * - When round ends, request randomness from Switchboard
 * - Oracle network provides verifiable random value
 * - Cannot be manipulated by validators or users
 * - Cryptographically secure and decentralized
 *
 * === INCENTIVIZED FINALIZATION ===
 * - Anyone can call resolve functions and receive CALLER_REWARD
 * - Randomness resolution happens off-chain via Crossbar
 * - On-chain settlement verifies and stores the random value
 *
 * === ESCROW PAYOUT ===
 * - Winner's prize held in escrow until claimed
 * - 7 day claim window
 * - Expired escrow returns to platform
 */
contract DailyPassLotteryV4 is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============================================
    // Constants
    // ============================================
    uint256 public constant ENTRY_FEE = 1 ether; // 1 MON
    uint256 public constant PLATFORM_SAFE_FEE_BPS = 500; // 5%
    uint256 public constant PLATFORM_WALLET_FEE_BPS = 500; // 5%
    uint256 public constant PRIZE_POOL_BPS = 9000; // 90%
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant ESCROW_CLAIM_PERIOD = 7 days;
    uint256 public constant ROUND_DURATION = 24 hours;
    uint256 public constant CALLER_REWARD = 0.01 ether;
    uint64 public constant MIN_SETTLEMENT_DELAY = 5; // 5 seconds for Switchboard

    // ============================================
    // Configuration
    // ============================================
    IshMON public shMonToken;
    ISwitchboard public switchboard;
    address public platformSafe;
    address public platformWallet;
    bool public shMonEnabled;

    // Switchboard Queues
    bytes32 private constant TESTNET_QUEUE = 0xc9477bfb5ff1012859f336cf98725680e7705ba2abece17188cfb28ca66ca5b0;
    bytes32 private constant MAINNET_QUEUE = 0x86807068432f186a147cf0b13a30067d386204ea9d6c8b04743ac2ef010b0752;
    bytes32 public immutable queue;

    // ============================================
    // Round State
    // ============================================
    enum RoundStatus {
        Active,           // Accepting entries
        RandomnessPending, // Waiting for randomness
        Finalized         // Winner selected
    }

    struct DailyRound {
        uint256 roundId;
        uint256 startTime;
        uint256 endTime;
        uint256 prizePoolMon;
        uint256 prizePoolShMon;
        uint256 participantCount;
        RoundStatus status;
        // Switchboard randomness
        bytes32 randomnessId;
        uint256 randomValue;
        uint256 randomnessRequestedAt;
        // Winner
        address winner;
        uint256 winnerIndex;
        uint256 callerRewardsPaid;
    }

    struct DailyPass {
        uint256 roundId;
        address beneficiary;
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
    event RandomnessRequested(
        uint256 indexed roundId,
        bytes32 indexed randomnessId,
        address indexed caller,
        uint256 reward
    );
    event WinnerRevealed(
        uint256 indexed roundId,
        address indexed winner,
        uint256 winnerIndex,
        uint256 randomValue,
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
        address _switchboard,
        address _platformSafe,
        address _platformWallet,
        address _shMonToken
    ) Ownable(msg.sender) {
        require(_switchboard != address(0), "Invalid Switchboard");
        require(_platformSafe != address(0), "Invalid platform safe");
        require(_platformWallet != address(0), "Invalid platform wallet");

        switchboard = ISwitchboard(_switchboard);
        platformSafe = _platformSafe;
        platformWallet = _platformWallet;

        // Auto-detect: Monad Mainnet = 143, Testnet = 10143
        queue = block.chainid == 143 ? MAINNET_QUEUE : TESTNET_QUEUE;

        if (_shMonToken != address(0)) {
            shMonToken = IshMON(_shMonToken);
            shMonEnabled = true;
        }

        _startNewRound();
    }

    // ============================================
    // Entry Functions
    // ============================================

    function enterWithMon() external payable nonReentrant returns (uint256 entryIndex) {
        return _enterWithMon(msg.sender);
    }

    function enterWithMonFor(address beneficiary) external payable nonReentrant returns (uint256 entryIndex) {
        require(beneficiary != address(0), "Invalid beneficiary");
        return _enterWithMon(beneficiary);
    }

    function _enterWithMon(address beneficiary) internal returns (uint256 entryIndex) {
        require(msg.value >= ENTRY_FEE, "Entry fee is 1 MON");

        _lazyFinalizePreviousRounds();
        _checkAndRotateRound();

        require(rounds[currentRoundId].status == RoundStatus.Active, "Round not active");
        require(!hasEnteredRound[currentRoundId][beneficiary], "Already entered");

        DailyRound storage round = rounds[currentRoundId];

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

        if (platformSafeFee > 0) {
            platformSafeFeesCollected += platformSafeFee;
            (bool success, ) = platformSafe.call{value: platformSafeFee}("");
            require(success, "Platform Safe fee failed");
            emit PlatformSafeFeeCollected(platformSafe, platformSafeFee);
        }

        if (platformWalletFee > 0) {
            platformWalletFeesCollected += platformWalletFee;
            (bool success, ) = platformWallet.call{value: platformWalletFee}("");
            require(success, "Platform Wallet fee failed");
            emit PlatformWalletFeeCollected(platformWallet, platformWalletFee);
        }

        emit DailyPassPurchased(currentRoundId, beneficiary, msg.sender, entryIndex, false, msg.value);
        return entryIndex;
    }

    function enterWithShMon(uint256 shMonAmount) external nonReentrant returns (uint256 entryIndex) {
        return _enterWithShMon(msg.sender, shMonAmount);
    }

    function enterWithShMonFor(address beneficiary, uint256 shMonAmount) external nonReentrant returns (uint256 entryIndex) {
        require(beneficiary != address(0), "Invalid beneficiary");
        return _enterWithShMon(beneficiary, shMonAmount);
    }

    function _enterWithShMon(address beneficiary, uint256 shMonAmount) internal returns (uint256 entryIndex) {
        require(shMonEnabled, "shMON disabled");
        require(address(shMonToken) != address(0), "shMON not set");

        uint256 monEquivalent = shMonToken.convertToAssets(shMonAmount);
        require(monEquivalent >= ENTRY_FEE, "Insufficient shMON");

        _lazyFinalizePreviousRounds();
        _checkAndRotateRound();

        require(rounds[currentRoundId].status == RoundStatus.Active, "Round not active");
        require(!hasEnteredRound[currentRoundId][beneficiary], "Already entered");

        IERC20(address(shMonToken)).safeTransferFrom(msg.sender, address(this), shMonAmount);

        DailyRound storage round = rounds[currentRoundId];

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

        if (platformSafeFee > 0) {
            IERC20(address(shMonToken)).safeTransfer(platformSafe, platformSafeFee);
            platformSafeFeesCollected += platformSafeFee;
            emit PlatformSafeFeeCollected(platformSafe, platformSafeFee);
        }

        if (platformWalletFee > 0) {
            IERC20(address(shMonToken)).safeTransfer(platformWallet, platformWalletFee);
            platformWalletFeesCollected += platformWalletFee;
            emit PlatformWalletFeeCollected(platformWallet, platformWalletFee);
        }

        emit DailyPassPurchased(currentRoundId, beneficiary, msg.sender, entryIndex, true, shMonAmount);
        return entryIndex;
    }

    function getShMonEntryFee() external view returns (uint256) {
        if (address(shMonToken) == address(0)) return 0;
        return shMonToken.convertToShares(ENTRY_FEE);
    }

    // ============================================
    // Switchboard Randomness
    // ============================================

    /**
     * @notice Request randomness when round ends (anyone can call, receives reward)
     * @param roundId The round to request randomness for
     */
    function requestRandomness(uint256 roundId) external nonReentrant {
        DailyRound storage round = rounds[roundId];

        require(round.status == RoundStatus.Active, "Round not active");
        require(block.timestamp >= round.endTime, "Round not ended");
        require(round.participantCount > 0, "No participants");
        require(round.randomnessId == bytes32(0), "Already requested");

        // Generate unique randomness ID
        round.randomnessId = keccak256(abi.encodePacked(
            roundId,
            round.participantCount,
            block.timestamp,
            address(this)
        ));

        // Request randomness from Switchboard queue-based system
        round.status = RoundStatus.RandomnessPending;
        round.randomnessRequestedAt = block.timestamp;

        switchboard.createRandomness(
            round.randomnessId,
            MIN_SETTLEMENT_DELAY
        );

        // Pay caller reward
        uint256 reward = 0;
        if (address(this).balance >= CALLER_REWARD) {
            reward = CALLER_REWARD;
            round.callerRewardsPaid += reward;
            (bool success, ) = msg.sender.call{value: reward}("");
            if (!success) {
                reward = 0;
                round.callerRewardsPaid -= CALLER_REWARD;
            }
        }

        emit RandomnessRequested(roundId, round.randomnessId, msg.sender, reward);
    }

    /**
     * @notice Resolve randomness and select winner (anyone can call, receives reward)
     * @param roundId The round to resolve
     * @param encodedRandomness The encoded randomness from Crossbar
     */
    function resolveRandomness(uint256 roundId, bytes calldata encodedRandomness) external nonReentrant {
        DailyRound storage round = rounds[roundId];

        require(round.status == RoundStatus.RandomnessPending, "Not pending");
        require(round.randomnessId != bytes32(0), "Not requested");

        // Settle randomness with Switchboard
        switchboard.settleRandomness(encodedRandomness);

        // Get the randomness result
        SwitchboardTypes.Randomness memory randomness = switchboard.getRandomness(round.randomnessId);
        require(randomness.settledAt != 0, "Randomness not settled");

        // Store random value
        round.randomValue = randomness.value;

        // Select winner using verifiable random value
        uint256 winnerIndex = randomness.value % round.participantCount;
        address winner = roundParticipants[roundId][winnerIndex];

        round.winner = winner;
        round.winnerIndex = winnerIndex;
        round.status = RoundStatus.Finalized;

        // Pay caller reward
        uint256 reward = 0;
        if (address(this).balance >= CALLER_REWARD) {
            reward = CALLER_REWARD;
            round.callerRewardsPaid += reward;
            (bool success, ) = msg.sender.call{value: reward}("");
            if (!success) {
                reward = 0;
                round.callerRewardsPaid -= CALLER_REWARD;
            }
        }

        // Create escrow
        uint256 escrowMonAmount = round.prizePoolMon > round.callerRewardsPaid
            ? round.prizePoolMon - round.callerRewardsPaid
            : 0;

        escrows[roundId] = Escrow({
            roundId: roundId,
            winner: winner,
            monAmount: escrowMonAmount,
            shMonAmount: round.prizePoolShMon,
            createdAt: block.timestamp,
            expiresAt: block.timestamp + ESCROW_CLAIM_PERIOD,
            claimed: false
        });

        userWinnings[winner].push(roundId);
        totalPrizesPaid += escrowMonAmount;

        emit WinnerRevealed(
            roundId, winner, winnerIndex, randomness.value,
            escrowMonAmount, round.prizePoolShMon,
            msg.sender, reward
        );

        _checkAndRotateRound();
    }

    // ============================================
    // Lazy Finalization
    // ============================================

    function _lazyFinalizePreviousRounds() internal {
        uint256 minRound = currentRoundId > 5 ? currentRoundId - 5 : 0;

        for (uint256 i = currentRoundId; i > minRound; i--) {
            DailyRound storage round = rounds[i];

            if (round.participantCount == 0 || round.status == RoundStatus.Finalized) {
                continue;
            }

            if (i == currentRoundId && block.timestamp < round.endTime) {
                continue;
            }

            // Auto-request randomness if round ended but not requested
            if (round.status == RoundStatus.Active && block.timestamp >= round.endTime) {
                if (round.randomnessId == bytes32(0)) {
                    round.randomnessId = keccak256(abi.encodePacked(
                        i,
                        round.participantCount,
                        block.timestamp,
                        address(this)
                    ));

                    round.status = RoundStatus.RandomnessPending;
                    round.randomnessRequestedAt = block.timestamp;

                    switchboard.createRandomness(
                        round.randomnessId,
                        MIN_SETTLEMENT_DELAY
                    );

                    emit RandomnessRequested(i, round.randomnessId, address(this), 0);
                }
            }
        }
    }

    // ============================================
    // Escrow & Claims
    // ============================================

    function claimPrize(uint256 roundId) external nonReentrant {
        _claimPrize(msg.sender, roundId);
    }

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

        if (esc.monAmount > 0) {
            (bool success, ) = beneficiary.call{value: esc.monAmount}("");
            require(success, "MON failed");
        }

        if (esc.shMonAmount > 0) {
            IERC20(address(shMonToken)).safeTransfer(beneficiary, esc.shMonAmount);
        }

        emit PrizeClaimed(roundId, beneficiary, esc.monAmount, esc.shMonAmount);

        _checkAndRotateRound();
    }

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

        _checkAndRotateRound();
    }

    // ============================================
    // Round Management
    // ============================================

    function _checkAndRotateRound() internal {
        DailyRound storage current = rounds[currentRoundId];

        if (block.timestamp >= current.endTime) {
            if (current.participantCount > 0 && current.status != RoundStatus.Finalized) {
                if (current.randomnessId == bytes32(0)) {
                    current.status = RoundStatus.Active; // Will be handled by lazy finalization
                }
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
            prizePoolMon: 0,
            prizePoolShMon: 0,
            participantCount: 0,
            status: RoundStatus.Active,
            randomnessId: bytes32(0),
            randomValue: 0,
            randomnessRequestedAt: 0,
            winner: address(0),
            winnerIndex: 0,
            callerRewardsPaid: 0
        });

        emit RoundStarted(currentRoundId, block.timestamp, block.timestamp + ROUND_DURATION);
    }

    function forceNewRound() external onlyOwner {
        rounds[currentRoundId].status = RoundStatus.RandomnessPending;
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

    function canRequestRandomness(uint256 roundId) external view returns (bool) {
        DailyRound memory r = rounds[roundId];
        return r.status == RoundStatus.Active
            && block.timestamp >= r.endTime
            && r.participantCount > 0
            && r.randomnessId == bytes32(0);
    }

    function canResolveRandomness(uint256 roundId) external view returns (bool) {
        DailyRound memory r = rounds[roundId];
        if (r.status != RoundStatus.RandomnessPending || r.randomnessId == bytes32(0)) {
            return false;
        }

        // Check if randomness is ready on Switchboard
        return switchboard.isRandomnessReady(r.randomnessId);
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
