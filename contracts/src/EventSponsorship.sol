// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title EventSponsorship
 * @notice Two-way sponsorship marketplace with escrow and voting
 *
 * FLOW A - Sponsor creates offer:
 * 1. Sponsor deposits WMON + sets claim code
 * 2. Host claims with code → becomes event manager
 * 3. Host sets event details (date, venue, GPS)
 * 4. Guests check-in at event
 * 5. Guests vote: "Was sponsor mentioned?"
 * 6. Finalize: YES majority → Host gets funds, NO → Sponsor refunded
 *
 * FLOW B - Host requests sponsorship:
 * 1. Host creates request with event details
 * 2. Sponsor funds the request
 * 3. Same voting/release flow
 *
 * FEES: 5% platform fee taken on deposit
 * VOTING: 1 hour window after check-in ends
 * RELEASE: Requires 25% min check-ins + majority YES votes
 */
contract EventSponsorship is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============================================
    // Constants
    // ============================================
    uint256 public constant PLATFORM_FEE_BPS = 500;     // 5%
    uint256 public constant VOTING_WINDOW = 1 hours;
    uint256 public constant MIN_CHECKIN_BPS = 2500;     // 25% of expected guests
    uint256 public constant DEFAULT_CHECKIN_DURATION = 6 hours;

    // ============================================
    // State
    // ============================================
    IERC20 public immutable wmon;
    address public treasury;
    address public oracle;

    uint256 private _idCounter;

    enum Status {
        AwaitingHost,      // Sponsor created, waiting for host
        AwaitingSponsor,   // Host created, waiting for funding
        Active,            // Both matched, event upcoming
        CheckingIn,        // Event live
        Voting,            // Vote period
        Completed,         // Funds to host
        Refunded,          // Funds to sponsor
        Cancelled
    }

    struct Sponsorship {
        // Parties
        address sponsor;
        address host;

        // Funds (after fee)
        uint256 amount;

        // Event
        string eventName;
        string city;
        string country;
        int256 latitude;
        int256 longitude;
        uint256 eventDate;
        uint256 expectedGuests;

        // Claim
        bytes32 claimCodeHash;

        // Timing
        uint256 checkInStart;
        uint256 checkInEnd;
        uint256 votingDeadline;
        uint256 createdAt;

        // State
        Status status;
        uint256 checkedInCount;
        uint256 yesVotes;
        uint256 noVotes;
    }

    // Storage
    mapping(uint256 => Sponsorship) public sponsorships;
    mapping(uint256 => mapping(address => bool)) public hasCheckedIn;
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    // ============================================
    // Events
    // ============================================
    event SponsorshipCreated(uint256 indexed id, address indexed creator, Status status, uint256 amount, string eventName);
    event SponsorshipClaimed(uint256 indexed id, address indexed host);
    event SponsorshipFunded(uint256 indexed id, address indexed sponsor, uint256 amount);
    event EventDetailsSet(uint256 indexed id, uint256 eventDate, int256 lat, int256 lng);
    event GuestCheckedIn(uint256 indexed id, address indexed guest);
    event VoteCast(uint256 indexed id, address indexed voter, bool yes);
    event SponsorshipCompleted(uint256 indexed id, address indexed host, uint256 amount);
    event SponsorshipRefunded(uint256 indexed id, address indexed sponsor, uint256 amount);
    event SponsorshipCancelled(uint256 indexed id);

    // ============================================
    // Constructor
    // ============================================
    constructor(
        address _wmon,
        address _treasury,
        address _oracle
    ) Ownable(msg.sender) {
        require(_wmon != address(0), "Invalid WMON");
        require(_treasury != address(0), "Invalid treasury");
        wmon = IERC20(_wmon);
        treasury = _treasury;
        oracle = _oracle;
    }

    // ============================================
    // FLOW A: Sponsor Creates Offer
    // ============================================

    /**
     * @notice Sponsor creates offer and deposits WMON
     * @param amount WMON amount to deposit
     * @param eventName Event name/description
     * @param city City
     * @param country Country
     * @param expectedGuests Expected guest count
     * @param claimCode Plain text code (hashed on-chain)
     */
    function createSponsorshipOffer(
        uint256 amount,
        string calldata eventName,
        string calldata city,
        string calldata country,
        uint256 expectedGuests,
        string calldata claimCode
    ) external nonReentrant returns (uint256) {
        require(amount > 0, "Amount required");
        require(bytes(claimCode).length >= 4, "Code too short");
        require(expectedGuests > 0, "Guests required");

        // Transfer and take fee
        wmon.safeTransferFrom(msg.sender, address(this), amount);
        uint256 fee = (amount * PLATFORM_FEE_BPS) / 10000;
        uint256 netAmount = amount - fee;
        wmon.safeTransfer(treasury, fee);

        _idCounter++;
        uint256 id = _idCounter;

        sponsorships[id] = Sponsorship({
            sponsor: msg.sender,
            host: address(0),
            amount: netAmount,
            eventName: eventName,
            city: city,
            country: country,
            latitude: 0,
            longitude: 0,
            eventDate: 0,
            expectedGuests: expectedGuests,
            claimCodeHash: keccak256(abi.encodePacked(claimCode)),
            checkInStart: 0,
            checkInEnd: 0,
            votingDeadline: 0,
            createdAt: block.timestamp,
            status: Status.AwaitingHost,
            checkedInCount: 0,
            yesVotes: 0,
            noVotes: 0
        });

        emit SponsorshipCreated(id, msg.sender, Status.AwaitingHost, netAmount, eventName);
        return id;
    }

    /**
     * @notice Host claims sponsorship with code
     */
    function claimAsHost(uint256 id, string calldata claimCode) external {
        Sponsorship storage s = sponsorships[id];
        require(s.sponsor != address(0), "Not found");
        require(s.status == Status.AwaitingHost, "Not claimable");
        require(s.host == address(0), "Already claimed");
        require(keccak256(abi.encodePacked(claimCode)) == s.claimCodeHash, "Invalid code");

        s.host = msg.sender;
        s.status = Status.Active;

        emit SponsorshipClaimed(id, msg.sender);
    }

    // ============================================
    // FLOW B: Host Requests Sponsorship
    // ============================================

    /**
     * @notice Host creates sponsorship request
     */
    function createSponsorshipRequest(
        uint256 requestedAmount,
        string calldata eventName,
        string calldata city,
        string calldata country,
        int256 latitude,
        int256 longitude,
        uint256 eventDate,
        uint256 expectedGuests
    ) external returns (uint256) {
        require(requestedAmount > 0, "Amount required");
        require(expectedGuests > 0, "Guests required");

        _idCounter++;
        uint256 id = _idCounter;

        uint256 checkInStart = eventDate > 0 ? eventDate - 1 hours : 0;
        uint256 checkInEnd = eventDate > 0 ? eventDate + DEFAULT_CHECKIN_DURATION : 0;
        uint256 votingDeadline = checkInEnd > 0 ? checkInEnd + VOTING_WINDOW : 0;

        sponsorships[id] = Sponsorship({
            sponsor: address(0),
            host: msg.sender,
            amount: requestedAmount,
            eventName: eventName,
            city: city,
            country: country,
            latitude: latitude,
            longitude: longitude,
            eventDate: eventDate,
            expectedGuests: expectedGuests,
            claimCodeHash: bytes32(0),
            checkInStart: checkInStart,
            checkInEnd: checkInEnd,
            votingDeadline: votingDeadline,
            createdAt: block.timestamp,
            status: Status.AwaitingSponsor,
            checkedInCount: 0,
            yesVotes: 0,
            noVotes: 0
        });

        emit SponsorshipCreated(id, msg.sender, Status.AwaitingSponsor, requestedAmount, eventName);
        return id;
    }

    /**
     * @notice Sponsor funds a host's request
     */
    function fundSponsorship(uint256 id, uint256 amount) external nonReentrant {
        Sponsorship storage s = sponsorships[id];
        require(s.host != address(0), "Not found");
        require(s.status == Status.AwaitingSponsor, "Not fundable");
        require(s.sponsor == address(0), "Already funded");
        require(amount >= s.amount, "Below requested");

        // Transfer and take fee
        wmon.safeTransferFrom(msg.sender, address(this), amount);
        uint256 fee = (amount * PLATFORM_FEE_BPS) / 10000;
        uint256 netAmount = amount - fee;
        wmon.safeTransfer(treasury, fee);

        s.sponsor = msg.sender;
        s.amount = netAmount;
        s.status = Status.Active;

        emit SponsorshipFunded(id, msg.sender, netAmount);
    }

    // ============================================
    // Event Management
    // ============================================

    /**
     * @notice Host sets/updates event details
     */
    function setEventDetails(
        uint256 id,
        uint256 eventDate,
        int256 latitude,
        int256 longitude
    ) external {
        Sponsorship storage s = sponsorships[id];
        require(s.status == Status.Active, "Not active");
        require(msg.sender == s.host || msg.sender == oracle || msg.sender == owner(), "Not authorized");
        require(eventDate > block.timestamp, "Must be future");

        s.eventDate = eventDate;
        s.latitude = latitude;
        s.longitude = longitude;
        s.checkInStart = eventDate - 1 hours;
        s.checkInEnd = eventDate + DEFAULT_CHECKIN_DURATION;
        s.votingDeadline = s.checkInEnd + VOTING_WINDOW;

        emit EventDetailsSet(id, eventDate, latitude, longitude);
    }

    // ============================================
    // Check-in
    // ============================================

    /**
     * @notice Guest checks in
     */
    function checkIn(uint256 id) external nonReentrant {
        Sponsorship storage s = sponsorships[id];
        require(s.status == Status.Active || s.status == Status.CheckingIn, "Not active");
        require(block.timestamp >= s.checkInStart, "Not open");
        require(block.timestamp <= s.checkInEnd, "Closed");
        require(!hasCheckedIn[id][msg.sender], "Already checked in");

        if (s.status == Status.Active) {
            s.status = Status.CheckingIn;
        }

        hasCheckedIn[id][msg.sender] = true;
        s.checkedInCount++;

        emit GuestCheckedIn(id, msg.sender);
    }

    /**
     * @notice Oracle checks in guest (for GPS verification)
     */
    function checkInFor(uint256 id, address guest) external {
        require(msg.sender == oracle || msg.sender == owner(), "Not oracle");

        Sponsorship storage s = sponsorships[id];
        require(s.status == Status.Active || s.status == Status.CheckingIn, "Not active");
        require(!hasCheckedIn[id][guest], "Already checked in");

        if (s.status == Status.Active) {
            s.status = Status.CheckingIn;
        }

        hasCheckedIn[id][guest] = true;
        s.checkedInCount++;

        emit GuestCheckedIn(id, guest);
    }

    // ============================================
    // Voting
    // ============================================

    /**
     * @notice Guest votes on sponsor fulfillment
     * @param yes true = "Sponsor was mentioned", false = "Not mentioned"
     */
    function vote(uint256 id, bool yes) external nonReentrant {
        Sponsorship storage s = sponsorships[id];

        // Auto-transition to voting
        if ((s.status == Status.CheckingIn || s.status == Status.Active) && block.timestamp > s.checkInEnd) {
            s.status = Status.Voting;
        }

        require(s.status == Status.Voting, "Not voting period");
        require(block.timestamp <= s.votingDeadline, "Voting ended");
        require(hasCheckedIn[id][msg.sender], "Not checked in");
        require(!hasVoted[id][msg.sender], "Already voted");

        hasVoted[id][msg.sender] = true;

        if (yes) {
            s.yesVotes++;
        } else {
            s.noVotes++;
        }

        emit VoteCast(id, msg.sender, yes);
    }

    // ============================================
    // Finalization
    // ============================================

    /**
     * @notice Finalize and release/refund funds
     */
    function finalize(uint256 id) external nonReentrant {
        Sponsorship storage s = sponsorships[id];
        require(
            s.status == Status.Voting ||
            s.status == Status.CheckingIn ||
            s.status == Status.Active,
            "Cannot finalize"
        );
        require(block.timestamp > s.votingDeadline, "Voting not ended");
        require(s.amount > 0, "No funds");

        uint256 minCheckins = (s.expectedGuests * MIN_CHECKIN_BPS) / 10000;
        if (minCheckins == 0) minCheckins = 1;

        bool release =
            s.checkedInCount >= minCheckins &&
            s.yesVotes + s.noVotes > 0 &&
            s.yesVotes > s.noVotes;

        if (release) {
            s.status = Status.Completed;
            wmon.safeTransfer(s.host, s.amount);
            emit SponsorshipCompleted(id, s.host, s.amount);
        } else {
            s.status = Status.Refunded;
            wmon.safeTransfer(s.sponsor, s.amount);
            emit SponsorshipRefunded(id, s.sponsor, s.amount);
        }
    }

    /**
     * @notice Cancel before event starts
     */
    function cancel(uint256 id) external nonReentrant {
        Sponsorship storage s = sponsorships[id];
        require(
            msg.sender == s.sponsor ||
            msg.sender == s.host ||
            msg.sender == owner(),
            "Not authorized"
        );
        require(
            s.status == Status.AwaitingHost ||
            s.status == Status.AwaitingSponsor ||
            s.status == Status.Active,
            "Cannot cancel"
        );

        if (s.eventDate > 0) {
            require(block.timestamp < s.checkInStart, "Event started");
        }

        s.status = Status.Cancelled;

        // Refund sponsor if funded
        if (s.sponsor != address(0) && s.amount > 0) {
            wmon.safeTransfer(s.sponsor, s.amount);
        }

        emit SponsorshipCancelled(id);
    }

    // ============================================
    // View Functions
    // ============================================

    function getSponsorship(uint256 id) external view returns (Sponsorship memory) {
        return sponsorships[id];
    }

    function getVoteTally(uint256 id) external view returns (uint256 yes, uint256 no) {
        Sponsorship storage s = sponsorships[id];
        return (s.yesVotes, s.noVotes);
    }

    function canFinalize(uint256 id) external view returns (bool) {
        Sponsorship storage s = sponsorships[id];
        return block.timestamp > s.votingDeadline &&
               (s.status == Status.Voting || s.status == Status.CheckingIn || s.status == Status.Active);
    }

    function isCheckedIn(uint256 id, address user) external view returns (bool) {
        return hasCheckedIn[id][user];
    }

    function getTotalSponsorships() external view returns (uint256) {
        return _idCounter;
    }

    // ============================================
    // Admin
    // ============================================

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid");
        treasury = _treasury;
    }

    function setOracle(address _oracle) external onlyOwner {
        oracle = _oracle;
    }

    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
    }
}
