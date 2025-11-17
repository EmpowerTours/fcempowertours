// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title TandaPool
 * @notice Rotating Savings and Credit Association (ROSCA) contract for group savings
 * @dev Users pool TOURS tokens and take turns receiving the entire pot
 *
 * How Tanda Works:
 * - N members each contribute X TOURS per round
 * - Each round, one member receives N * X TOURS (the full pot)
 * - Continues for N rounds until everyone has received their turn
 * - Use cases: group trips, concert tickets, restaurant visits, staking pools
 */
contract TandaPool is Ownable, ReentrancyGuard {

    // ========================================================================
    // ENUMS & STRUCTS
    // ========================================================================

    enum PoolType {
        SAVINGS,      // General savings pool
        EXPERIENCE,   // For itinerary purchases (restaurants, attractions)
        EVENT,        // For concert/event tickets
        STAKE         // For pooled staking
    }

    enum PoolStatus {
        OPEN,         // Accepting members
        ACTIVE,       // Running (all members joined)
        COMPLETED,    // All rounds finished
        CANCELLED     // Pool cancelled
    }

    struct Pool {
        uint256 poolId;
        string name;
        address creator;
        uint256 maxMembers;
        uint256 contributionPerRound;  // TOURS per member per round
        uint256 totalRounds;           // Usually = maxMembers
        uint256 currentRound;
        uint256 roundStartTime;
        uint256 roundDuration;         // Default: 7 days
        PoolType poolType;
        PoolStatus status;
        uint256 createdAt;
    }

    struct Member {
        address memberAddress;
        uint256 joinedAt;
        uint256 totalContributed;
        uint256 payoutRound;           // Which round they receive payout (0 = not assigned)
        bool hasClaimed;
        bool active;
    }

    // ========================================================================
    // STATE
    // ========================================================================

    mapping(uint256 => Pool) public pools;
    mapping(uint256 => mapping(address => Member)) public poolMembers;
    mapping(uint256 => address[]) public poolMemberList;
    mapping(uint256 => mapping(uint256 => address)) public roundRecipients; // poolId => round => recipient

    uint256 private _poolIdCounter;
    IERC20 public toursToken;

    uint256 public constant DEFAULT_ROUND_DURATION = 2 minutes; // Testing: 2 minutes (production: 7 days)
    uint256 public constant MIN_MEMBERS = 2;
    uint256 public constant MAX_MEMBERS = 20;

    // ========================================================================
    // EVENTS
    // ========================================================================

    event PoolCreated(
        uint256 indexed poolId,
        address indexed creator,
        string name,
        uint256 maxMembers,
        uint256 contributionPerRound,
        PoolType poolType
    );

    event MemberJoined(
        uint256 indexed poolId,
        address indexed member,
        uint256 payoutRound
    );

    event RoundAdvanced(
        uint256 indexed poolId,
        uint256 round,
        address indexed recipient,
        uint256 amount
    );

    event PayoutClaimed(
        uint256 indexed poolId,
        uint256 round,
        address indexed recipient,
        uint256 amount
    );

    event PoolCompleted(
        uint256 indexed poolId,
        uint256 totalDistributed
    );

    event PoolCancelled(
        uint256 indexed poolId,
        string reason
    );

    // ========================================================================
    // CONSTRUCTOR
    // ========================================================================

    constructor(address _toursToken) Ownable(msg.sender) {
        require(_toursToken != address(0), "Invalid TOURS token");
        toursToken = IERC20(_toursToken);
    }

    // ========================================================================
    // POOL CREATION
    // ========================================================================

    /**
     * @dev Create new tanda pool
     */
    function createPool(
        string memory name,
        uint256 maxMembers,
        uint256 contributionPerRound,
        uint256 totalRounds,
        PoolType poolType
    ) external returns (uint256) {
        require(maxMembers >= MIN_MEMBERS && maxMembers <= MAX_MEMBERS, "Invalid member count");
        require(contributionPerRound > 0, "Contribution must be > 0");
        require(totalRounds > 0 && totalRounds <= maxMembers, "Invalid round count");

        uint256 poolId = _poolIdCounter++;

        Pool storage pool = pools[poolId];
        pool.poolId = poolId;
        pool.name = name;
        pool.creator = msg.sender;
        pool.maxMembers = maxMembers;
        pool.contributionPerRound = contributionPerRound;
        pool.totalRounds = totalRounds;
        pool.currentRound = 0;
        pool.roundDuration = DEFAULT_ROUND_DURATION;
        pool.poolType = poolType;
        pool.status = PoolStatus.OPEN;
        pool.createdAt = block.timestamp;

        emit PoolCreated(
            poolId,
            msg.sender,
            name,
            maxMembers,
            contributionPerRound,
            poolType
        );

        return poolId;
    }

    // ========================================================================
    // JOINING POOL
    // ========================================================================

    /**
     * @dev Join an existing pool
     */
    function joinPool(uint256 poolId) external nonReentrant {
        Pool storage pool = pools[poolId];
        require(pool.status == PoolStatus.OPEN, "Pool not open");
        require(poolMemberList[poolId].length < pool.maxMembers, "Pool full");
        require(!poolMembers[poolId][msg.sender].active, "Already joined");

        // Transfer total contribution upfront (all rounds)
        uint256 totalContribution = pool.contributionPerRound * pool.totalRounds;
        require(
            toursToken.transferFrom(msg.sender, address(this), totalContribution),
            "Transfer failed"
        );

        // Add member
        Member storage member = poolMembers[poolId][msg.sender];
        member.memberAddress = msg.sender;
        member.joinedAt = block.timestamp;
        member.totalContributed = totalContribution;
        member.active = true;

        // Assign payout round (sequential order)
        uint256 payoutRound = poolMemberList[poolId].length + 1;
        member.payoutRound = payoutRound;
        roundRecipients[poolId][payoutRound] = msg.sender;

        poolMemberList[poolId].push(msg.sender);

        emit MemberJoined(poolId, msg.sender, payoutRound);

        // If pool is full, activate it
        if (poolMemberList[poolId].length == pool.maxMembers) {
            pool.status = PoolStatus.ACTIVE;
            pool.roundStartTime = block.timestamp;
            pool.currentRound = 1;
        }
    }

    // ========================================================================
    // CLAIMING PAYOUT
    // ========================================================================

    /**
     * @dev Claim payout for your assigned round
     */
    function claimPayout(uint256 poolId) external nonReentrant {
        Pool storage pool = pools[poolId];
        require(pool.status == PoolStatus.ACTIVE, "Pool not active");

        Member storage member = poolMembers[poolId][msg.sender];
        require(member.active, "Not a member");
        require(!member.hasClaimed, "Already claimed");
        require(member.payoutRound == pool.currentRound, "Not your round");

        // Check if round duration has passed
        require(
            block.timestamp >= pool.roundStartTime + pool.roundDuration,
            "Round not ready"
        );

        // Calculate payout (all members' contributions for this round)
        uint256 payout = pool.contributionPerRound * poolMemberList[poolId].length;

        member.hasClaimed = true;

        // Transfer payout
        require(toursToken.transfer(msg.sender, payout), "Payout failed");

        emit PayoutClaimed(poolId, pool.currentRound, msg.sender, payout);

        // Advance to next round
        pool.currentRound++;
        pool.roundStartTime = block.timestamp;

        emit RoundAdvanced(poolId, pool.currentRound, msg.sender, payout);

        // Check if pool is complete
        if (pool.currentRound > pool.totalRounds) {
            pool.status = PoolStatus.COMPLETED;
            emit PoolCompleted(poolId, payout * pool.totalRounds);
        }
    }

    // ========================================================================
    // VIEW FUNCTIONS
    // ========================================================================

    /**
     * @dev Get pool details
     */
    function getPool(uint256 poolId) external view returns (Pool memory) {
        return pools[poolId];
    }

    /**
     * @dev Get member details
     */
    function getMember(uint256 poolId, address memberAddress)
        external
        view
        returns (Member memory)
    {
        return poolMembers[poolId][memberAddress];
    }

    /**
     * @dev Get all members in pool
     */
    function getPoolMembers(uint256 poolId)
        external
        view
        returns (address[] memory)
    {
        return poolMemberList[poolId];
    }

    /**
     * @dev Get current round recipient
     */
    function getCurrentRoundRecipient(uint256 poolId)
        external
        view
        returns (address)
    {
        Pool storage pool = pools[poolId];
        return roundRecipients[poolId][pool.currentRound];
    }

    /**
     * @dev Get pool stats
     */
    function getPoolStats(uint256 poolId)
        external
        view
        returns (
            uint256 totalMembers,
            uint256 totalPooled,
            uint256 roundsRemaining,
            uint256 currentRoundPayout,
            uint256 timeUntilNextRound
        )
    {
        Pool storage pool = pools[poolId];

        totalMembers = poolMemberList[poolId].length;
        totalPooled = pool.contributionPerRound * pool.totalRounds * totalMembers;
        roundsRemaining = pool.totalRounds >= pool.currentRound
            ? pool.totalRounds - pool.currentRound + 1
            : 0;
        currentRoundPayout = pool.contributionPerRound * totalMembers;

        if (pool.status == PoolStatus.ACTIVE) {
            uint256 roundEnd = pool.roundStartTime + pool.roundDuration;
            timeUntilNextRound = block.timestamp < roundEnd
                ? roundEnd - block.timestamp
                : 0;
        }
    }

    /**
     * @dev Check if user can claim
     */
    function canClaim(uint256 poolId, address memberAddress)
        external
        view
        returns (bool)
    {
        Pool storage pool = pools[poolId];
        Member storage member = poolMembers[poolId][memberAddress];

        return (
            pool.status == PoolStatus.ACTIVE &&
            member.active &&
            !member.hasClaimed &&
            member.payoutRound == pool.currentRound &&
            block.timestamp >= pool.roundStartTime + pool.roundDuration
        );
    }

    // ========================================================================
    // ADMIN FUNCTIONS
    // ========================================================================

    /**
     * @dev Cancel pool (only if not active)
     */
    function cancelPool(uint256 poolId, string memory reason) external {
        Pool storage pool = pools[poolId];
        require(msg.sender == pool.creator || msg.sender == owner(), "Not authorized");
        require(pool.status == PoolStatus.OPEN, "Cannot cancel active pool");

        pool.status = PoolStatus.CANCELLED;

        // Refund all members
        address[] memory members = poolMemberList[poolId];
        for (uint256 i = 0; i < members.length; i++) {
            Member storage member = poolMembers[poolId][members[i]];
            if (member.totalContributed > 0) {
                toursToken.transfer(members[i], member.totalContributed);
                member.totalContributed = 0;
            }
        }

        emit PoolCancelled(poolId, reason);
    }

    /**
     * @dev Update round duration
     */
    function setRoundDuration(uint256 poolId, uint256 newDuration) external {
        Pool storage pool = pools[poolId];
        require(msg.sender == pool.creator || msg.sender == owner(), "Not authorized");
        require(pool.status == PoolStatus.OPEN, "Pool already active");
        require(newDuration >= 1 minutes && newDuration <= 30 days, "Invalid duration");

        pool.roundDuration = newDuration;
    }

    /**
     * @dev Emergency withdraw (only owner, for stuck funds)
     */
    function emergencyWithdraw(uint256 amount) external onlyOwner {
        require(toursToken.transfer(owner(), amount), "Transfer failed");
    }

    /**
     * @dev Get contract TOURS balance
     */
    function getContractBalance() external view returns (uint256) {
        return toursToken.balanceOf(address(this));
    }
}
