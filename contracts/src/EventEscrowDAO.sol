// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title EventEscrowDAO
 * @notice Community-Governed Event Escrow System
 *
 * === FLOW ===
 * 1. SPONSOR creates event, deposits MON into escrow
 * 2. USERS register to attend (wallet tracked)
 * 3. EVENT happens - users check in, receive Travel Stamp NFT
 * 4. POST-EVENT: 48-hour voting window opens
 * 5. STAMP HOLDERS vote: "Did sponsor deliver on promises?"
 * 6. VOTE OUTCOME:
 *    - If >66% YES: Funds released to sponsor
 *    - If >66% NO: Funds returned to escrow (redistributed to attendees)
 *    - If tie/no quorum: Platform mediates
 *
 * === VOTING POWER ===
 * Each Travel Stamp NFT = 1 vote for that event
 * Must hold stamp at time of voting
 *
 * === DISPUTE CATEGORIES ===
 * - Event didn't happen
 * - Promised rewards not delivered
 * - Event quality significantly below expectations
 * - Venue/timing changed without notice
 */
contract EventEscrowDAO is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============================================
    // Constants
    // ============================================
    uint256 public constant VOTING_PERIOD = 48 hours;
    uint256 public constant QUORUM_BPS = 3000;           // 30% of stamp holders must vote
    uint256 public constant APPROVAL_THRESHOLD_BPS = 6600; // 66% approval needed
    uint256 public constant MIN_VOTES_FOR_DECISION = 3;    // At least 3 votes needed

    // ============================================
    // State Variables
    // ============================================
    IERC20 public wmonToken;
    address public eventContract;      // EventSponsorshipAgreement address
    address public platformWallet;

    // ============================================
    // Structs
    // ============================================
    struct EventEscrow {
        uint256 eventId;
        address sponsor;
        uint256 escrowAmount;          // Amount held in escrow
        uint256 hostPayment;           // Amount promised to event host (if different from sponsor)
        address eventHost;             // Host address (venue, organizer, etc.)

        // Registration
        uint256 registeredCount;       // Users who registered to attend
        uint256 attendedCount;         // Users who actually checked in

        // Voting
        uint256 votingStartTime;
        uint256 votingEndTime;
        uint256 yesVotes;              // "Sponsor delivered"
        uint256 noVotes;               // "Sponsor did NOT deliver"
        bool votingFinalized;
        bool fundsReleased;

        // Outcome
        VoteOutcome outcome;
        string disputeReason;          // If disputed, reason from voters
    }

    struct Registration {
        bool registered;
        uint256 registeredAt;
        bool attended;
        uint256 stampTokenId;          // Travel Stamp NFT ID (0 if not attended)
        bool hasVoted;
        bool votedYes;
    }

    enum VoteOutcome { Pending, Approved, Rejected, Mediation }

    // ============================================
    // Mappings
    // ============================================
    mapping(uint256 => EventEscrow) public escrows;
    mapping(uint256 => mapping(address => Registration)) public registrations;
    mapping(uint256 => address[]) public registeredUsers;
    mapping(uint256 => address[]) public voters;

    // Track stamp token ownership for voting eligibility
    mapping(uint256 => mapping(uint256 => bool)) public stampUsedForVote; // eventId => stampTokenId => used

    // ============================================
    // Events
    // ============================================
    event EscrowCreated(uint256 indexed eventId, address indexed sponsor, uint256 amount, address host);
    event UserRegistered(uint256 indexed eventId, address indexed user, uint256 timestamp);
    event AttendanceRecorded(uint256 indexed eventId, address indexed user, uint256 stampTokenId);
    event VotingStarted(uint256 indexed eventId, uint256 startTime, uint256 endTime);
    event VoteCast(uint256 indexed eventId, address indexed voter, bool approved, uint256 stampTokenId);
    event VotingFinalized(uint256 indexed eventId, VoteOutcome outcome, uint256 yesVotes, uint256 noVotes);
    event FundsReleased(uint256 indexed eventId, address indexed recipient, uint256 amount);
    event FundsRefunded(uint256 indexed eventId, uint256 totalRefunded, uint256 attendeeCount);
    event DisputeRaised(uint256 indexed eventId, address indexed voter, string reason);

    // ============================================
    // Constructor
    // ============================================
    constructor(
        address _wmonToken,
        address _eventContract,
        address _platformWallet
    ) Ownable(msg.sender) {
        require(_wmonToken != address(0), "Invalid WMON");
        require(_platformWallet != address(0), "Invalid platform wallet");

        wmonToken = IERC20(_wmonToken);
        eventContract = _eventContract;
        platformWallet = _platformWallet;
    }

    // ============================================
    // Escrow Creation (called by EventSponsorshipAgreement)
    // ============================================

    /**
     * @notice Create escrow for an event
     * @param eventId The event ID from EventSponsorshipAgreement
     * @param sponsor The sponsor address
     * @param amount Amount held in escrow
     * @param eventHost Address of event host (receives funds if approved)
     * @param hostPayment Amount to pay host (can be less than total escrow)
     */
    function createEscrow(
        uint256 eventId,
        address sponsor,
        uint256 amount,
        address eventHost,
        uint256 hostPayment
    ) external {
        require(msg.sender == eventContract || msg.sender == owner(), "Not authorized");
        require(escrows[eventId].eventId == 0, "Escrow already exists");
        require(hostPayment <= amount, "Host payment exceeds escrow");

        escrows[eventId] = EventEscrow({
            eventId: eventId,
            sponsor: sponsor,
            escrowAmount: amount,
            hostPayment: hostPayment,
            eventHost: eventHost != address(0) ? eventHost : sponsor,
            registeredCount: 0,
            attendedCount: 0,
            votingStartTime: 0,
            votingEndTime: 0,
            yesVotes: 0,
            noVotes: 0,
            votingFinalized: false,
            fundsReleased: false,
            outcome: VoteOutcome.Pending,
            disputeReason: ""
        });

        emit EscrowCreated(eventId, sponsor, amount, eventHost != address(0) ? eventHost : sponsor);
    }

    // ============================================
    // User Registration
    // ============================================

    /**
     * @notice Register to attend an event
     * @dev Users must register before event to be eligible to vote
     */
    function registerForEvent(uint256 eventId) external {
        EventEscrow storage escrow = escrows[eventId];
        require(escrow.eventId != 0, "Event not found");
        require(!registrations[eventId][msg.sender].registered, "Already registered");

        registrations[eventId][msg.sender] = Registration({
            registered: true,
            registeredAt: block.timestamp,
            attended: false,
            stampTokenId: 0,
            hasVoted: false,
            votedYes: false
        });

        registeredUsers[eventId].push(msg.sender);
        escrow.registeredCount++;

        emit UserRegistered(eventId, msg.sender, block.timestamp);
    }

    /**
     * @notice Record attendance (called when user receives Travel Stamp)
     * @dev Only callable by EventSponsorshipAgreement or oracle
     */
    function recordAttendance(
        uint256 eventId,
        address user,
        uint256 stampTokenId
    ) external {
        require(msg.sender == eventContract || msg.sender == owner(), "Not authorized");

        EventEscrow storage escrow = escrows[eventId];
        require(escrow.eventId != 0, "Event not found");

        Registration storage reg = registrations[eventId][user];

        // Auto-register if not pre-registered (walk-ins)
        if (!reg.registered) {
            reg.registered = true;
            reg.registeredAt = block.timestamp;
            registeredUsers[eventId].push(user);
            escrow.registeredCount++;
        }

        reg.attended = true;
        reg.stampTokenId = stampTokenId;
        escrow.attendedCount++;

        emit AttendanceRecorded(eventId, user, stampTokenId);
    }

    // ============================================
    // Voting System
    // ============================================

    /**
     * @notice Start voting period for an event
     * @dev Called after event ends (check-in window closes)
     */
    function startVoting(uint256 eventId) external {
        EventEscrow storage escrow = escrows[eventId];
        require(escrow.eventId != 0, "Event not found");
        require(escrow.votingStartTime == 0, "Voting already started");
        require(escrow.attendedCount > 0, "No attendees");
        require(
            msg.sender == eventContract ||
            msg.sender == escrow.sponsor ||
            msg.sender == owner(),
            "Not authorized"
        );

        escrow.votingStartTime = block.timestamp;
        escrow.votingEndTime = block.timestamp + VOTING_PERIOD;

        emit VotingStarted(eventId, escrow.votingStartTime, escrow.votingEndTime);
    }

    /**
     * @notice Cast vote on whether sponsor fulfilled promises
     * @param eventId Event to vote on
     * @param approved True = sponsor delivered, False = sponsor failed
     * @param reason Optional reason if voting NO
     */
    function vote(
        uint256 eventId,
        bool approved,
        string calldata reason
    ) external {
        EventEscrow storage escrow = escrows[eventId];
        Registration storage reg = registrations[eventId][msg.sender];

        require(escrow.eventId != 0, "Event not found");
        require(escrow.votingStartTime > 0, "Voting not started");
        require(block.timestamp <= escrow.votingEndTime, "Voting ended");
        require(reg.attended, "Did not attend event");
        require(reg.stampTokenId != 0, "No stamp NFT");
        require(!reg.hasVoted, "Already voted");
        require(!stampUsedForVote[eventId][reg.stampTokenId], "Stamp already used");

        reg.hasVoted = true;
        reg.votedYes = approved;
        stampUsedForVote[eventId][reg.stampTokenId] = true;
        voters[eventId].push(msg.sender);

        if (approved) {
            escrow.yesVotes++;
        } else {
            escrow.noVotes++;
            if (bytes(reason).length > 0 && bytes(escrow.disputeReason).length == 0) {
                escrow.disputeReason = reason;
                emit DisputeRaised(eventId, msg.sender, reason);
            }
        }

        emit VoteCast(eventId, msg.sender, approved, reg.stampTokenId);
    }

    /**
     * @notice Finalize voting and determine outcome
     */
    function finalizeVoting(uint256 eventId) external nonReentrant {
        EventEscrow storage escrow = escrows[eventId];

        require(escrow.eventId != 0, "Event not found");
        require(escrow.votingStartTime > 0, "Voting not started");
        require(block.timestamp > escrow.votingEndTime, "Voting still active");
        require(!escrow.votingFinalized, "Already finalized");

        escrow.votingFinalized = true;

        uint256 totalVotes = escrow.yesVotes + escrow.noVotes;
        uint256 quorumNeeded = (escrow.attendedCount * QUORUM_BPS) / 10000;

        // Determine outcome
        if (totalVotes < MIN_VOTES_FOR_DECISION || totalVotes < quorumNeeded) {
            // Not enough votes - platform mediates
            escrow.outcome = VoteOutcome.Mediation;
        } else {
            uint256 approvalRate = (escrow.yesVotes * 10000) / totalVotes;

            if (approvalRate >= APPROVAL_THRESHOLD_BPS) {
                escrow.outcome = VoteOutcome.Approved;
            } else if (approvalRate <= (10000 - APPROVAL_THRESHOLD_BPS)) {
                escrow.outcome = VoteOutcome.Rejected;
            } else {
                // Too close to call - mediation
                escrow.outcome = VoteOutcome.Mediation;
            }
        }

        emit VotingFinalized(eventId, escrow.outcome, escrow.yesVotes, escrow.noVotes);

        // Auto-release funds if approved
        if (escrow.outcome == VoteOutcome.Approved) {
            _releaseFundsToHost(eventId);
        }
    }

    // ============================================
    // Fund Distribution
    // ============================================

    /**
     * @notice Release escrow funds to event host
     * @dev Called automatically if voting approves, or by platform for mediation
     */
    function _releaseFundsToHost(uint256 eventId) internal {
        EventEscrow storage escrow = escrows[eventId];
        require(!escrow.fundsReleased, "Funds already released");

        escrow.fundsReleased = true;

        // Transfer host payment
        if (escrow.hostPayment > 0) {
            wmonToken.safeTransfer(escrow.eventHost, escrow.hostPayment);
        }

        // Return excess to sponsor
        uint256 excess = escrow.escrowAmount - escrow.hostPayment;
        if (excess > 0) {
            wmonToken.safeTransfer(escrow.sponsor, excess);
        }

        emit FundsReleased(eventId, escrow.eventHost, escrow.hostPayment);
    }

    /**
     * @notice Refund escrow to attendees (if sponsor failed)
     * @dev Called if voting rejects or by platform for mediation
     */
    function refundToAttendees(uint256 eventId) external nonReentrant {
        EventEscrow storage escrow = escrows[eventId];

        require(escrow.eventId != 0, "Event not found");
        require(escrow.votingFinalized, "Voting not finalized");
        require(
            escrow.outcome == VoteOutcome.Rejected ||
            (escrow.outcome == VoteOutcome.Mediation && msg.sender == owner()),
            "Not eligible for refund"
        );
        require(!escrow.fundsReleased, "Funds already released");

        escrow.fundsReleased = true;

        // Distribute equally to all attendees
        uint256 perAttendee = escrow.escrowAmount / escrow.attendedCount;
        uint256 totalDistributed = 0;

        address[] memory registered = registeredUsers[eventId];
        for (uint256 i = 0; i < registered.length; i++) {
            Registration storage reg = registrations[eventId][registered[i]];
            if (reg.attended && reg.stampTokenId != 0) {
                wmonToken.safeTransfer(registered[i], perAttendee);
                totalDistributed += perAttendee;
            }
        }

        // Send remainder to platform (dust from rounding)
        uint256 remainder = escrow.escrowAmount - totalDistributed;
        if (remainder > 0) {
            wmonToken.safeTransfer(platformWallet, remainder);
        }

        emit FundsRefunded(eventId, totalDistributed, escrow.attendedCount);
    }

    /**
     * @notice Platform mediates and releases funds (for Mediation outcomes)
     */
    function mediateAndRelease(
        uint256 eventId,
        bool releaseToHost,
        uint256 hostAmount
    ) external onlyOwner nonReentrant {
        EventEscrow storage escrow = escrows[eventId];

        require(escrow.eventId != 0, "Event not found");
        require(escrow.outcome == VoteOutcome.Mediation, "Not in mediation");
        require(!escrow.fundsReleased, "Funds already released");

        escrow.fundsReleased = true;

        if (releaseToHost) {
            uint256 toHost = hostAmount > 0 ? hostAmount : escrow.hostPayment;
            require(toHost <= escrow.escrowAmount, "Amount exceeds escrow");

            wmonToken.safeTransfer(escrow.eventHost, toHost);

            uint256 remainder = escrow.escrowAmount - toHost;
            if (remainder > 0) {
                wmonToken.safeTransfer(escrow.sponsor, remainder);
            }

            emit FundsReleased(eventId, escrow.eventHost, toHost);
        } else {
            // Refund to sponsor with penalty
            uint256 penalty = (escrow.escrowAmount * 1000) / 10000; // 10% penalty
            uint256 refund = escrow.escrowAmount - penalty;

            wmonToken.safeTransfer(escrow.sponsor, refund);
            wmonToken.safeTransfer(platformWallet, penalty);

            emit FundsReleased(eventId, escrow.sponsor, refund);
        }
    }

    // ============================================
    // View Functions
    // ============================================

    function getEscrow(uint256 eventId) external view returns (EventEscrow memory) {
        return escrows[eventId];
    }

    function getRegistration(uint256 eventId, address user) external view returns (Registration memory) {
        return registrations[eventId][user];
    }

    function getRegisteredUsers(uint256 eventId) external view returns (address[] memory) {
        return registeredUsers[eventId];
    }

    function getVoters(uint256 eventId) external view returns (address[] memory) {
        return voters[eventId];
    }

    function getVotingStatus(uint256 eventId) external view returns (
        bool votingActive,
        uint256 timeRemaining,
        uint256 yesVotes,
        uint256 noVotes,
        uint256 totalAttendees,
        VoteOutcome currentOutcome
    ) {
        EventEscrow storage escrow = escrows[eventId];

        bool active = escrow.votingStartTime > 0 &&
                      block.timestamp <= escrow.votingEndTime &&
                      !escrow.votingFinalized;

        uint256 remaining = 0;
        if (active && escrow.votingEndTime > block.timestamp) {
            remaining = escrow.votingEndTime - block.timestamp;
        }

        return (
            active,
            remaining,
            escrow.yesVotes,
            escrow.noVotes,
            escrow.attendedCount,
            escrow.outcome
        );
    }

    function hasUserVoted(uint256 eventId, address user) external view returns (bool) {
        return registrations[eventId][user].hasVoted;
    }

    function canUserVote(uint256 eventId, address user) external view returns (bool) {
        EventEscrow storage escrow = escrows[eventId];
        Registration storage reg = registrations[eventId][user];

        return escrow.votingStartTime > 0 &&
               block.timestamp <= escrow.votingEndTime &&
               reg.attended &&
               reg.stampTokenId != 0 &&
               !reg.hasVoted;
    }

    // ============================================
    // Admin Functions
    // ============================================

    function setEventContract(address _eventContract) external onlyOwner {
        eventContract = _eventContract;
    }

    function setPlatformWallet(address _platformWallet) external onlyOwner {
        require(_platformWallet != address(0), "Invalid address");
        platformWallet = _platformWallet;
    }

    function depositWMON(uint256 amount) external {
        wmonToken.safeTransferFrom(msg.sender, address(this), amount);
    }
}
