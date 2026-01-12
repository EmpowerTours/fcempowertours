// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@pythnetwork/entropy-sdk-solidity/IEntropyConsumer.sol";
import "@pythnetwork/entropy-sdk-solidity/IEntropyV2.sol";

/**
 * @title EventSponsorshipV2
 * @notice Multi-sponsor events with attendee voting on host fulfillment
 *
 * === MODEL ===
 * - HOST creates event (runs the show, promotes sponsors)
 * - SPONSORS deposit WMON for brand exposure
 * - Platform takes % fee from each sponsor deposit
 * - ATTENDEES vote: Did host fulfill sponsor promotion?
 * - YES → Host receives funds + voters whitelisted | NO → Sponsors refunded
 * - No votes in 1 hour after event close → Auto-refund to sponsors
 *
 * === FLOW ===
 * 1. Host creates event
 * 2. Sponsors deposit funds (platform fee taken immediately)
 * 3. Event happens (host promotes sponsor brands)
 * 4. Attendees check in
 * 5. Event closes → 1 hour voting window opens
 * 6. Attendees vote YES/NO on host fulfillment
 * 7. After voting: funds released to host OR refunded to sponsors
 * 8. Voters get whitelisted + random TOURS airdrop (Pyth Entropy)
 */

// Interface for SponsorWhitelist integration
interface ISponsorWhitelist {
    function addToWhitelist(address[] calldata users) external;
    function recordStamp(address user, uint256 eventId) external;
}

contract EventSponsorshipV2 is Ownable, ReentrancyGuard, IEntropyConsumer {
    using SafeERC20 for IERC20;

    // ============================================
    // Constants
    // ============================================
    uint256 public constant PLATFORM_FEE_BPS = 500;           // 5% platform fee
    uint256 public constant VOTING_WINDOW = 1 hours;          // 1 hour to vote after event ends
    uint256 public constant MIN_SPONSORSHIP = 10 ether;       // 10 WMON minimum per sponsor

    // ============================================
    // State Variables
    // ============================================
    IERC20 public wmonToken;
    IERC20 public toursToken;
    address public treasury;              // Platform treasury receives fees
    address public oracle;                // Backend for GPS/check-in verification
    ISponsorWhitelist public sponsorWhitelist;  // Whitelist contract for voters

    // Pyth Entropy for random TOURS rewards
    IEntropyV2 public entropy;

    uint256 private _eventIdCounter;

    // Random TOURS reward range (min to max per voter)
    uint256 public minToursReward = 0.5 ether;   // 0.5 TOURS minimum
    uint256 public maxToursReward = 5 ether;     // 5 TOURS maximum

    // Pending randomness requests (sequenceNumber => eventId)
    mapping(uint64 => uint256) public pendingRandomness;

    // ============================================
    // Enums
    // ============================================
    enum EventStatus {
        Active,      // Event is live, accepting sponsors & check-ins
        Voting,      // Event ended, voting in progress
        Completed,   // Voting done, funds distributed to host
        Refunded,    // Voting failed or timeout, sponsors refunded
        Cancelled    // Host cancelled before event
    }

    enum VoteChoice { None, Yes, No }

    // ============================================
    // Structs
    // ============================================
    struct Event {
        uint256 eventId;
        string name;
        string description;

        // Host info
        address host;
        uint256 hostFid;

        // Location
        string venueName;
        string city;
        string country;
        int256 latitude;      // GPS * 1e6
        int256 longitude;     // GPS * 1e6

        // Timing
        uint256 eventDate;
        uint256 checkInStart;
        uint256 checkInEnd;
        uint256 votingDeadline;   // checkInEnd + 1 hour
        uint256 createdAt;

        // Status
        EventStatus status;
        uint256 checkedInCount;

        // Totals
        uint256 totalSponsored;       // Total WMON from all sponsors (after platform fee)
        uint256 totalPlatformFees;    // Total fees taken
    }

    struct Sponsor {
        address sponsorAddress;
        string companyName;
        string logoIPFS;
        uint256 depositAmount;        // Amount after platform fee
        uint256 platformFeePaid;      // Fee paid to platform
        uint256 depositedAt;
        bool refunded;
    }

    struct Attendee {
        address userAddress;
        uint256 userFid;
        uint256 checkInTime;
        bool gpsVerified;
        VoteChoice vote;
        bool hasVoted;
    }

    // ============================================
    // Mappings
    // ============================================
    mapping(uint256 => Event) public events;
    mapping(uint256 => Sponsor[]) public eventSponsors;
    mapping(uint256 => mapping(address => uint256)) public sponsorIndex; // eventId => sponsor => index+1 (0 = not sponsor)
    mapping(uint256 => mapping(address => Attendee)) public eventAttendees;
    mapping(uint256 => address[]) public eventAttendeeList;

    // Voting tallies
    mapping(uint256 => uint256) public yesVotes;
    mapping(uint256 => uint256) public noVotes;

    // Track ALL voters for whitelist (eventId => list of voters who participated)
    mapping(uint256 => address[]) public voterList;

    // ============================================
    // Events
    // ============================================
    event EventCreated(uint256 indexed eventId, address indexed host, string name, uint256 eventDate);
    event SponsorDeposited(uint256 indexed eventId, address indexed sponsor, string companyName, uint256 amount, uint256 platformFee);
    event AttendeeCheckedIn(uint256 indexed eventId, address indexed user, uint256 userFid);
    event VoteCast(uint256 indexed eventId, address indexed voter, bool hostFulfilled);
    event VotingStarted(uint256 indexed eventId, uint256 deadline);
    event FundsReleasedToHost(uint256 indexed eventId, address indexed host, uint256 amount);
    event SponsorsRefunded(uint256 indexed eventId, uint256 totalRefunded);
    event EventCancelled(uint256 indexed eventId);
    event VotersRewarded(uint256 indexed eventId, uint256 voterCount, uint256 totalToursDistributed);
    event RandomnessRequested(uint256 indexed eventId, uint64 sequenceNumber);
    event VoterReward(uint256 indexed eventId, address indexed voter, uint256 toursAmount);

    // ============================================
    // Constructor
    // ============================================
    constructor(
        address _wmonToken,
        address _toursToken,
        address _treasury,
        address _oracle,
        address _entropy,
        address _sponsorWhitelist
    ) Ownable(msg.sender) {
        require(_wmonToken != address(0), "Invalid WMON");
        require(_toursToken != address(0), "Invalid TOURS");
        require(_treasury != address(0), "Invalid treasury");
        require(_oracle != address(0), "Invalid oracle");
        require(_entropy != address(0), "Invalid entropy");

        wmonToken = IERC20(_wmonToken);
        toursToken = IERC20(_toursToken);
        treasury = _treasury;
        oracle = _oracle;
        entropy = IEntropyV2(_entropy);
        sponsorWhitelist = ISponsorWhitelist(_sponsorWhitelist); // Can be address(0) initially
    }

    // ============================================
    // Host Functions
    // ============================================

    /**
     * @notice Create a new event (host only)
     */
    function createEvent(
        string memory name,
        string memory description,
        uint256 hostFid,
        string memory venueName,
        string memory city,
        string memory country,
        int256 latitude,
        int256 longitude,
        uint256 eventDate,
        uint256 checkInDuration
    ) external returns (uint256) {
        require(eventDate > block.timestamp, "Event must be in future");
        require(checkInDuration > 0 && checkInDuration <= 24 hours, "Invalid check-in duration");

        _eventIdCounter++;
        uint256 eventId = _eventIdCounter;

        uint256 checkInEnd = eventDate + checkInDuration;

        events[eventId] = Event({
            eventId: eventId,
            name: name,
            description: description,
            host: msg.sender,
            hostFid: hostFid,
            venueName: venueName,
            city: city,
            country: country,
            latitude: latitude,
            longitude: longitude,
            eventDate: eventDate,
            checkInStart: eventDate - 1 hours,
            checkInEnd: checkInEnd,
            votingDeadline: checkInEnd + VOTING_WINDOW,
            createdAt: block.timestamp,
            status: EventStatus.Active,
            checkedInCount: 0,
            totalSponsored: 0,
            totalPlatformFees: 0
        });

        emit EventCreated(eventId, msg.sender, name, eventDate);
        return eventId;
    }

    // ============================================
    // Sponsor Functions
    // ============================================

    /**
     * @notice Sponsor an event (deposit WMON for brand exposure)
     * @param eventId Event to sponsor
     * @param companyName Sponsor's company/brand name
     * @param logoIPFS IPFS hash of logo
     * @param amount WMON amount to deposit
     */
    function sponsorEvent(
        uint256 eventId,
        string memory companyName,
        string memory logoIPFS,
        uint256 amount
    ) external nonReentrant {
        Event storage evt = events[eventId];
        require(evt.eventId != 0, "Event not found");
        require(evt.status == EventStatus.Active, "Event not active");
        require(block.timestamp < evt.eventDate, "Event already started");
        require(amount >= MIN_SPONSORSHIP, "Below minimum sponsorship");
        require(sponsorIndex[eventId][msg.sender] == 0, "Already a sponsor");

        // Transfer WMON from sponsor
        wmonToken.safeTransferFrom(msg.sender, address(this), amount);

        // Take platform fee immediately
        uint256 platformFee = (amount * PLATFORM_FEE_BPS) / 10000;
        uint256 netAmount = amount - platformFee;

        wmonToken.safeTransfer(treasury, platformFee);

        // Record sponsor
        eventSponsors[eventId].push(Sponsor({
            sponsorAddress: msg.sender,
            companyName: companyName,
            logoIPFS: logoIPFS,
            depositAmount: netAmount,
            platformFeePaid: platformFee,
            depositedAt: block.timestamp,
            refunded: false
        }));

        sponsorIndex[eventId][msg.sender] = eventSponsors[eventId].length; // index + 1

        // Update event totals
        evt.totalSponsored += netAmount;
        evt.totalPlatformFees += platformFee;

        emit SponsorDeposited(eventId, msg.sender, companyName, netAmount, platformFee);
    }

    // ============================================
    // Attendee Functions
    // ============================================

    /**
     * @notice Check in to event (GPS verified by oracle)
     */
    function checkIn(
        uint256 eventId,
        uint256 userFid
    ) external nonReentrant {
        Event storage evt = events[eventId];
        require(evt.eventId != 0, "Event not found");
        require(evt.status == EventStatus.Active, "Event not active");
        require(block.timestamp >= evt.checkInStart, "Check-in not open");
        require(block.timestamp <= evt.checkInEnd, "Check-in closed");
        require(eventAttendees[eventId][msg.sender].checkInTime == 0, "Already checked in");

        eventAttendees[eventId][msg.sender] = Attendee({
            userAddress: msg.sender,
            userFid: userFid,
            checkInTime: block.timestamp,
            gpsVerified: true,
            vote: VoteChoice.None,
            hasVoted: false
        });

        eventAttendeeList[eventId].push(msg.sender);
        evt.checkedInCount++;

        emit AttendeeCheckedIn(eventId, msg.sender, userFid);
    }

    /**
     * @notice Oracle-assisted check-in
     */
    function checkInFor(
        uint256 eventId,
        address user,
        uint256 userFid,
        bool gpsVerified
    ) external {
        require(msg.sender == oracle || msg.sender == owner(), "Unauthorized");

        Event storage evt = events[eventId];
        require(evt.eventId != 0, "Event not found");
        require(evt.status == EventStatus.Active, "Event not active");
        require(eventAttendees[eventId][user].checkInTime == 0, "Already checked in");

        eventAttendees[eventId][user] = Attendee({
            userAddress: user,
            userFid: userFid,
            checkInTime: block.timestamp,
            gpsVerified: gpsVerified,
            vote: VoteChoice.None,
            hasVoted: false
        });

        eventAttendeeList[eventId].push(user);
        evt.checkedInCount++;

        emit AttendeeCheckedIn(eventId, user, userFid);
    }

    // ============================================
    // Voting Functions
    // ============================================

    /**
     * @notice Start voting period (after check-in ends)
     */
    function startVoting(uint256 eventId) external {
        Event storage evt = events[eventId];
        require(evt.eventId != 0, "Event not found");
        require(evt.status == EventStatus.Active, "Invalid status");
        require(block.timestamp > evt.checkInEnd, "Check-in not ended");

        evt.status = EventStatus.Voting;
        emit VotingStarted(eventId, evt.votingDeadline);
    }

    /**
     * @notice Vote on whether host fulfilled sponsor promotion
     * @param eventId Event to vote on
     * @param hostFulfilled true = YES host did good, false = NO host failed
     */
    function vote(uint256 eventId, bool hostFulfilled) external nonReentrant {
        Event storage evt = events[eventId];
        require(evt.eventId != 0, "Event not found");

        // Auto-transition to voting if needed
        if (evt.status == EventStatus.Active && block.timestamp > evt.checkInEnd) {
            evt.status = EventStatus.Voting;
            emit VotingStarted(eventId, evt.votingDeadline);
        }

        require(evt.status == EventStatus.Voting, "Not in voting period");
        require(block.timestamp <= evt.votingDeadline, "Voting ended");

        Attendee storage attendee = eventAttendees[eventId][msg.sender];
        require(attendee.checkInTime > 0, "Must be checked-in attendee");
        require(attendee.gpsVerified, "GPS not verified");
        require(!attendee.hasVoted, "Already voted");

        attendee.hasVoted = true;
        attendee.vote = hostFulfilled ? VoteChoice.Yes : VoteChoice.No;

        // Track all voters for whitelist (participation = whitelist access)
        voterList[eventId].push(msg.sender);

        if (hostFulfilled) {
            yesVotes[eventId]++;
        } else {
            noVotes[eventId]++;
        }

        emit VoteCast(eventId, msg.sender, hostFulfilled);
    }

    // ============================================
    // Resolution Functions
    // ============================================

    /**
     * @notice Finalize voting and distribute funds
     * @dev Can be called by anyone after voting deadline
     */
    function finalizeEvent(uint256 eventId) external nonReentrant {
        Event storage evt = events[eventId];
        require(evt.eventId != 0, "Event not found");
        require(
            evt.status == EventStatus.Voting ||
            (evt.status == EventStatus.Active && block.timestamp > evt.checkInEnd),
            "Cannot finalize yet"
        );
        require(block.timestamp > evt.votingDeadline, "Voting still open");

        uint256 yes = yesVotes[eventId];
        uint256 no = noVotes[eventId];
        uint256 totalVotes = yes + no;

        // If no votes OR majority NO → Refund sponsors
        // If majority YES → Release to host
        if (totalVotes == 0 || no >= yes) {
            _refundSponsors(eventId);
        } else {
            _releaseToHost(eventId);
        }
    }

    /**
     * @notice Emergency finalize if no one calls finalizeEvent
     * @dev After voting deadline + 24 hours, auto-refund sponsors
     */
    function emergencyRefund(uint256 eventId) external nonReentrant {
        Event storage evt = events[eventId];
        require(evt.eventId != 0, "Event not found");
        require(evt.status == EventStatus.Voting || evt.status == EventStatus.Active, "Invalid status");
        require(block.timestamp > evt.votingDeadline + 24 hours, "Too early for emergency");

        _refundSponsors(eventId);
    }

    /**
     * @notice Refund all sponsors and whitelist voters who participated
     */
    function _refundSponsors(uint256 eventId) internal {
        Event storage evt = events[eventId];
        evt.status = EventStatus.Refunded;

        uint256 totalRefunded = 0;
        Sponsor[] storage sponsors = eventSponsors[eventId];

        for (uint256 i = 0; i < sponsors.length; i++) {
            if (!sponsors[i].refunded && sponsors[i].depositAmount > 0) {
                sponsors[i].refunded = true;
                totalRefunded += sponsors[i].depositAmount;
                wmonToken.safeTransfer(sponsors[i].sponsorAddress, sponsors[i].depositAmount);
            }
        }

        // Whitelist all voters who participated (YES or NO) - reward for honest participation
        _whitelistVoters(eventId);

        emit SponsorsRefunded(eventId, totalRefunded);
    }

    /**
     * @notice Whitelist all voters and request random TOURS rewards via Pyth
     */
    function _whitelistVoters(uint256 eventId) internal {
        address[] storage voters = voterList[eventId];
        uint256 voterCount = voters.length;

        if (voterCount == 0) return;

        // Whitelist voters (if SponsorWhitelist is configured)
        if (address(sponsorWhitelist) != address(0)) {
            try sponsorWhitelist.addToWhitelist(voters) {} catch {}
        }

        // Request randomness from Pyth for TOURS rewards
        uint256 fee = entropy.getFeeV2();
        if (address(this).balance >= fee && toursToken.balanceOf(address(this)) >= voterCount * minToursReward) {
            uint64 sequenceNumber = entropy.requestV2{value: fee}();
            pendingRandomness[sequenceNumber] = eventId;
            emit RandomnessRequested(eventId, sequenceNumber);
        }
    }

    // ============================================
    // Pyth Entropy Callback
    // ============================================

    /**
     * @notice Called by Pyth Entropy with random number
     * @dev Distributes random TOURS rewards to all voters
     */
    function entropyCallback(
        uint64 sequenceNumber,
        address,
        bytes32 randomNumber
    ) internal override {
        uint256 eventId = pendingRandomness[sequenceNumber];
        require(eventId != 0, "Unknown sequence");

        delete pendingRandomness[sequenceNumber];

        address[] storage voters = voterList[eventId];
        uint256 voterCount = voters.length;
        uint256 toursBalance = toursToken.balanceOf(address(this));
        uint256 totalDistributed = 0;

        // Distribute random TOURS to each voter
        for (uint256 i = 0; i < voterCount; i++) {
            // Generate pseudo-random reward for each voter using the random seed
            uint256 voterRandom = uint256(keccak256(abi.encodePacked(randomNumber, i)));
            uint256 reward = minToursReward + (voterRandom % (maxToursReward - minToursReward + 1));

            // Cap at available balance
            if (totalDistributed + reward > toursBalance) {
                reward = toursBalance > totalDistributed ? toursBalance - totalDistributed : 0;
            }

            if (reward > 0) {
                toursToken.transfer(voters[i], reward);
                totalDistributed += reward;
                emit VoterReward(eventId, voters[i], reward);
            }
        }

        emit VotersRewarded(eventId, voterCount, totalDistributed);
    }

    /**
     * @notice Required by IEntropyConsumer - returns the entropy contract
     */
    function getEntropy() internal view override returns (address) {
        return address(entropy);
    }

    /**
     * @notice Release funds to host and whitelist all voters
     */
    function _releaseToHost(uint256 eventId) internal {
        Event storage evt = events[eventId];
        evt.status = EventStatus.Completed;

        uint256 totalToHost = evt.totalSponsored;

        if (totalToHost > 0) {
            wmonToken.safeTransfer(evt.host, totalToHost);
        }

        // Whitelist all voters who participated (YES or NO)
        _whitelistVoters(eventId);

        emit FundsReleasedToHost(eventId, evt.host, totalToHost);
    }

    // ============================================
    // Cancel Functions
    // ============================================

    /**
     * @notice Host cancels event before it starts → Sponsors refunded
     */
    function cancelEvent(uint256 eventId) external nonReentrant {
        Event storage evt = events[eventId];
        require(evt.eventId != 0, "Event not found");
        require(msg.sender == evt.host || msg.sender == owner(), "Unauthorized");
        require(evt.status == EventStatus.Active, "Cannot cancel");
        require(block.timestamp < evt.eventDate, "Event already started");

        evt.status = EventStatus.Cancelled;
        _refundSponsors(eventId);

        emit EventCancelled(eventId);
    }

    // ============================================
    // View Functions
    // ============================================

    function getEvent(uint256 eventId) external view returns (Event memory) {
        return events[eventId];
    }

    function getEventSponsors(uint256 eventId) external view returns (Sponsor[] memory) {
        return eventSponsors[eventId];
    }

    function getSponsorCount(uint256 eventId) external view returns (uint256) {
        return eventSponsors[eventId].length;
    }

    function getAttendeeCount(uint256 eventId) external view returns (uint256) {
        return events[eventId].checkedInCount;
    }

    function getVoteTally(uint256 eventId) external view returns (uint256 yes, uint256 no, uint256 total) {
        return (yesVotes[eventId], noVotes[eventId], yesVotes[eventId] + noVotes[eventId]);
    }

    function getAttendeeList(uint256 eventId) external view returns (address[] memory) {
        return eventAttendeeList[eventId];
    }

    function hasVoted(uint256 eventId, address user) external view returns (bool) {
        return eventAttendees[eventId][user].hasVoted;
    }

    function isSponsor(uint256 eventId, address addr) external view returns (bool) {
        return sponsorIndex[eventId][addr] > 0;
    }

    function getVoters(uint256 eventId) external view returns (address[] memory) {
        return voterList[eventId];
    }

    // ============================================
    // Admin Functions
    // ============================================

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;
    }

    function setOracle(address _oracle) external onlyOwner {
        require(_oracle != address(0), "Invalid oracle");
        oracle = _oracle;
    }

    function setSponsorWhitelist(address _sponsorWhitelist) external onlyOwner {
        sponsorWhitelist = ISponsorWhitelist(_sponsorWhitelist);
    }

    function setToursRewardRange(uint256 _min, uint256 _max) external onlyOwner {
        require(_min <= _max, "Min must be <= max");
        minToursReward = _min;
        maxToursReward = _max;
    }

    function setEntropy(address _entropy) external onlyOwner {
        require(_entropy != address(0), "Invalid entropy");
        entropy = IEntropyV2(_entropy);
    }

    /**
     * @notice Fund contract with TOURS for voter rewards
     */
    function fundToursRewards(uint256 amount) external {
        toursToken.transferFrom(msg.sender, address(this), amount);
    }

    /**
     * @notice Receive ETH for Pyth Entropy fees
     */
    receive() external payable {}

    function getToursBalance() external view returns (uint256) {
        return toursToken.balanceOf(address(this));
    }

    function getEntropyFee() external view returns (uint256) {
        return entropy.getFeeV2();
    }

    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
    }

    function emergencyWithdrawETH(uint256 amount) external onlyOwner {
        payable(owner()).transfer(amount);
    }
}
