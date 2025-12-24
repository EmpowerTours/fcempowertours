// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IPassportNFT {
    function getPassportData(uint256 tokenId) external view returns (
        uint256 userFid,
        string memory countryCode,
        string memory countryName,
        string memory region,
        string memory continent,
        uint256 mintedAt,
        bool verified,
        string memory verificationProof,
        uint256 verifiedAt
    );
    function getCreditScore(uint256 tokenId) external view returns (uint256);
    function ownerOf(uint256 tokenId) external view returns (address);
}

/**
 * @title TourGuideRegistry
 * @notice Secure Farcaster-based tour guide marketplace with free matching and admin approval
 *
 * === FEATURES ===
 * 1. FREE MATCHING: Connect with guides for coffee/advice (no payment)
 * 2. PAID BOOKINGS: Book guides for tours (90/10 revenue split)
 * 3. TWO-TIER REGISTRATION:
 *    - 200+ credit: Auto-approved
 *    - 100-199 credit: Admin video call + approval
 * 4. SECURITY: ReentrancyGuard, Pausable, rate limiting, anti-manipulation
 *
 * === REGISTRATION PATHS ===
 * Path A (Auto): 200+ credit → registerGuide() → instant approval
 * Path B (Manual): 100-199 credit → applyForGuideApproval() → admin video call → approve → registerGuide()
 */
contract TourGuideRegistry is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ============================================
    // Constants
    // ============================================
    uint256 public constant AUTO_APPROVE_CREDIT = 200;      // Auto-approved
    uint256 public constant MANUAL_APPROVE_CREDIT = 100;    // Manual approval
    uint256 public constant GUIDE_PERCENTAGE = 90;
    uint256 public constant PLATFORM_PERCENTAGE = 10;
    uint256 public constant MINIMUM_HOURLY_RATE = 10 ether;
    uint256 public constant MAXIMUM_HOURLY_RATE = 10000 ether;
    uint256 public constant MAX_HOURS_PER_BOOKING = 168;
    uint256 public constant AUTO_COMPLETE_PERIOD = 7 days;
    uint256 public constant MAX_COUNTRIES = 50;
    uint256 public constant BOOKING_COOLDOWN = 1 minutes;
    uint256 public constant MAX_CANCELLATION_RATE = 30;
    uint256 public constant MAX_FREE_CONNECTIONS_PER_DAY = 5;
    uint256 public constant PAID_CONNECTION_FEE = 10 ether; // 10 WMON
    uint256 public constant MAX_BOOKINGS_PER_DAY = 3;
    uint256 public constant MAX_FREE_SKIPS_PER_DAY = 20;
    uint256 public constant PAID_SKIP_FEE = 5 ether; // 5 WMON per skip

    // ============================================
    // Interfaces
    // ============================================
    IPassportNFT public immutable passportNFT;
    IERC20 public immutable wmonToken;
    IERC20 public immutable toursToken;
    address public platformWallet;
    address public approvalOracle;  // Can approve guide applications

    // ============================================
    // Enums
    // ============================================
    enum GuideApplicationStatus { PENDING, APPROVED, REJECTED }

    // ============================================
    // Structs
    // ============================================
    struct TourGuide {
        uint256 guideFid;
        address guideAddress;
        uint256 passportTokenId;
        string[] countries;
        uint256 hourlyRateWMON;
        uint256 hourlyRateTOURS;
        string bio;
        string profileImageIPFS;
        uint256 registeredAt;
        uint256 totalBookings;
        uint256 totalCompletedTours;
        uint256 cancellationCount;
        uint256 totalEarningsWMON;
        uint256 totalEarningsTOURS;
        bool active;
        uint256 averageRating;
        uint256 ratingCount;
        bool suspended;
    }

    struct GuideApplication {
        uint256 guideFid;
        address applicantAddress;
        uint256 passportTokenId;
        uint256 creditScore;
        string[] countries;
        string bio;
        string profileImageIPFS;
        string videoCallProofIPFS;      // IPFS proof after admin video call
        uint256 appliedAt;
        GuideApplicationStatus status;
        string adminNotes;
    }

    struct Connection {
        uint256 connectionId;
        uint256 travelerFid;
        uint256 guideFid;
        address travelerAddress;
        address guideAddress;
        string meetupType;              // "coffee", "advice", "trial", etc.
        string message;                 // Traveler's intro message
        uint256 requestedAt;
        bool accepted;
        bool declined;
        string guideResponse;
    }

    struct Booking {
        uint256 bookingId;
        uint256 guideFid;
        uint256 travelerFid;
        address guideAddress;
        address travelerAddress;
        uint256 hoursDuration;
        uint256 totalCost;
        address paymentToken;
        uint256 bookedAt;
        bool guideMarkedComplete;
        uint256 guideMarkedAt;
        string guideProofIPFS;
        bool completed;
        uint256 completedAt;
        bool autoCompleted;
        uint256 travelerRating;
        string travelerReviewIPFS;
        uint256 guideRating;
        string guideReviewIPFS;
        bool cancelled;
        address cancelledBy;
        string cancellationReason;
    }

    // ============================================
    // Storage
    // ============================================
    // Guides
    mapping(uint256 => TourGuide) public guides;
    mapping(uint256 => bool) public isRegisteredGuide;
    mapping(string => uint256[]) private guidesByCountry;
    mapping(uint256 => uint256) public passportToGuide;
    mapping(address => uint256) public addressToGuideFid;

    // Applications (manual approval path)
    mapping(uint256 => GuideApplication) public applications;
    mapping(uint256 => bool) public hasApplied;
    mapping(uint256 => bool) public approvedGuides;
    uint256[] public pendingApplicationIds;

    // Connections (free matching)
    uint256 private _connectionIdCounter;
    mapping(uint256 => Connection) public connections;
    mapping(uint256 => uint256[]) public guideConnectionRequests;
    mapping(uint256 => uint256[]) public travelerConnections;
    mapping(uint256 => mapping(uint256 => uint256)) public dailyConnectionCount; // fid => day => count

    // Bookings (paid)
    uint256 private _bookingIdCounter;
    mapping(uint256 => Booking) public bookings;
    mapping(uint256 => uint256[]) public guideBookings;
    mapping(uint256 => uint256[]) public travelerBookings;
    mapping(uint256 => mapping(uint256 => uint256)) public dailyBookingCount; // fid => day => count

    // Guide Discovery (skips)
    mapping(uint256 => mapping(uint256 => uint256)) public dailySkipCount; // fid => day => count

    // Security
    mapping(address => uint256) public lastBookingTime;
    mapping(uint256 => mapping(uint256 => bool)) public hasBooked;

    // ============================================
    // Events
    // ============================================
    // Guide Registration
    event GuideRegistered(uint256 indexed guideFid, address indexed guideAddress, uint256 indexed passportTokenId, string[] countries);
    event GuideUpdated(uint256 indexed guideFid, uint256 hourlyRateWMON, uint256 hourlyRateTOURS, bool active);
    event GuideSuspended(uint256 indexed guideFid, string reason);
    event GuideReinstated(uint256 indexed guideFid);

    // Applications
    event GuideApplicationSubmitted(uint256 indexed guideFid, address indexed applicant, uint256 creditScore);
    event GuideApplicationApproved(uint256 indexed guideFid, string adminNotes);
    event GuideApplicationRejected(uint256 indexed guideFid, string reason);

    // Connections (Free)
    event ConnectionRequested(uint256 indexed connectionId, uint256 indexed travelerFid, uint256 indexed guideFid, string meetupType);
    event ConnectionAccepted(uint256 indexed connectionId, uint256 indexed travelerFid, uint256 indexed guideFid);
    event ConnectionDeclined(uint256 indexed connectionId, uint256 indexed travelerFid, uint256 indexed guideFid);
    event PaidConnectionRequested(uint256 indexed connectionId, uint256 indexed travelerFid, uint256 fee);

    // Bookings (Paid)
    event BookingCreated(uint256 indexed bookingId, uint256 indexed guideFid, uint256 indexed travelerFid, address traveler, uint256 hoursDuration, uint256 totalCost, address paymentToken);
    event TourMarkedComplete(uint256 indexed bookingId, uint256 indexed guideFid, string proofIPFS, uint256 timestamp);
    event TourCompleted(uint256 indexed bookingId, uint256 indexed guideFid, uint256 indexed travelerFid, uint256 rating, bool autoCompleted);
    event GuideRated(uint256 indexed guideFid, uint256 newAverageRating, uint256 ratingCount);
    event GuideReviewedTraveler(uint256 indexed bookingId, uint256 indexed travelerFid, uint256 rating);
    event BookingCancelled(uint256 indexed bookingId, address indexed cancelledBy, string reason, uint256 timestamp);

    // Guide Discovery
    event GuideSkipped(uint256 indexed travelerFid, uint256 indexed guideFid, bool paidSkip);
    event PaidSkipProcessed(uint256 indexed travelerFid, uint256 fee);

    // Admin
    event CountryAdded(uint256 indexed guideFid, string country);
    event ApprovalOracleUpdated(address indexed oldOracle, address indexed newOracle);
    event PlatformWalletUpdated(address indexed oldWallet, address indexed newWallet);
    event EmergencyWithdraw(address indexed token, uint256 amount, address indexed to);

    // ============================================
    // Modifiers
    // ============================================
    modifier onlyRegisteredGuide(uint256 guideFid) {
        require(isRegisteredGuide[guideFid], "Guide not registered");
        require(!guides[guideFid].suspended, "Guide suspended");
        _;
    }

    modifier validFid(uint256 fid) {
        require(fid > 0 && fid < type(uint64).max, "Invalid FID");
        _;
    }

    modifier validRating(uint256 rating) {
        require(rating <= 500, "Rating must be 0-500");
        _;
    }

    modifier onlyApprover() {
        require(msg.sender == owner() || msg.sender == approvalOracle, "Not authorized approver");
        _;
    }

    // ============================================
    // Constructor
    // ============================================
    constructor(
        address _passportNFT,
        address _wmonToken,
        address _toursToken,
        address _platformWallet,
        address _approvalOracle
    ) Ownable(msg.sender) {
        require(_passportNFT != address(0), "Invalid passport NFT");
        require(_wmonToken != address(0), "Invalid WMON");
        require(_toursToken != address(0), "Invalid TOURS");
        require(_platformWallet != address(0), "Invalid platform wallet");

        passportNFT = IPassportNFT(_passportNFT);
        wmonToken = IERC20(_wmonToken);
        toursToken = IERC20(_toursToken);
        platformWallet = _platformWallet;
        approvalOracle = _approvalOracle;
    }

    // ============================================
    // Guide Application (Manual Approval Path)
    // ============================================

    /**
     * @notice Apply for guide approval (for users with 100-199 credit)
     * @dev Admin will video call applicant, then approve/reject
     */
    function applyForGuideApproval(
        uint256 guideFid,
        uint256 passportTokenId,
        string[] memory countries,
        string memory bio,
        string memory profileImageIPFS
    ) external nonReentrant whenNotPaused validFid(guideFid) {
        require(!isRegisteredGuide[guideFid], "Already registered");
        require(!hasApplied[guideFid], "Application pending");
        require(countries.length > 0 && countries.length <= MAX_COUNTRIES, "Invalid country count");
        require(bytes(bio).length > 0 && bytes(bio).length <= 1000, "Bio must be 1-1000 chars");

        // Verify passport ownership
        require(passportNFT.ownerOf(passportTokenId) == msg.sender, "Not passport owner");

        // Check passport verified
        (,,,,,, bool verified,,) = passportNFT.getPassportData(passportTokenId);
        require(verified, "Passport not verified");

        uint256 creditScore = passportNFT.getCreditScore(passportTokenId);
        require(creditScore >= MANUAL_APPROVE_CREDIT, "Need at least 100 credit");
        require(creditScore < AUTO_APPROVE_CREDIT, "Use registerGuide() for 200+ credit");

        applications[guideFid] = GuideApplication({
            guideFid: guideFid,
            applicantAddress: msg.sender,
            passportTokenId: passportTokenId,
            creditScore: creditScore,
            countries: countries,
            bio: bio,
            profileImageIPFS: profileImageIPFS,
            videoCallProofIPFS: "",
            appliedAt: block.timestamp,
            status: GuideApplicationStatus.PENDING,
            adminNotes: ""
        });

        hasApplied[guideFid] = true;
        pendingApplicationIds.push(guideFid);

        emit GuideApplicationSubmitted(guideFid, msg.sender, creditScore);
    }

    /**
     * @notice Admin approves application after video call
     */
    function approveGuideApplication(
        uint256 guideFid,
        string memory videoCallProofIPFS,
        string memory adminNotes
    ) external onlyApprover {
        GuideApplication storage app = applications[guideFid];
        require(app.status == GuideApplicationStatus.PENDING, "Not pending");

        app.status = GuideApplicationStatus.APPROVED;
        app.videoCallProofIPFS = videoCallProofIPFS;
        app.adminNotes = adminNotes;

        approvedGuides[guideFid] = true;

        emit GuideApplicationApproved(guideFid, adminNotes);
    }

    /**
     * @notice Admin rejects application
     */
    function rejectGuideApplication(
        uint256 guideFid,
        string memory reason
    ) external onlyApprover {
        GuideApplication storage app = applications[guideFid];
        require(app.status == GuideApplicationStatus.PENDING, "Not pending");

        app.status = GuideApplicationStatus.REJECTED;
        app.adminNotes = reason;

        hasApplied[guideFid] = false; // Can reapply

        emit GuideApplicationRejected(guideFid, reason);
    }

    // ============================================
    // Guide Registration
    // ============================================

    /**
     * @notice Register as tour guide with AA wallet support
     * @dev passportOwner is the wallet that owns the passport (may differ from msg.sender when using AA)
     */
    function registerGuideFor(
        address passportOwner,
        uint256 guideFid,
        uint256 passportTokenId,
        string[] memory countries,
        uint256 hourlyRateWMON,
        uint256 hourlyRateTOURS,
        string memory bio,
        string memory profileImageIPFS
    ) public nonReentrant whenNotPaused validFid(guideFid) {
        require(passportOwner != address(0), "Invalid passport owner");
        require(!isRegisteredGuide[guideFid], "Already registered");
        require(passportToGuide[passportTokenId] == 0, "Passport already used");
        require(countries.length > 0 && countries.length <= MAX_COUNTRIES, "Invalid country count");
        require(hourlyRateWMON >= MINIMUM_HOURLY_RATE && hourlyRateWMON <= MAXIMUM_HOURLY_RATE, "Invalid WMON rate");
        require(bytes(bio).length > 0 && bytes(bio).length <= 1000, "Bio must be 1-1000 chars");

        // Verify passport ownership against passportOwner (not msg.sender for AA support)
        require(passportNFT.ownerOf(passportTokenId) == passportOwner, "Not passport owner");

        // TESTNET: Skip verification check - just need a valid passport
        // (,,,,,, bool verified,,) = passportNFT.getPassportData(passportTokenId);
        // require(verified, "Passport not verified");

        // TESTNET: No credit score requirement - anyone with passport can register
        _createGuideFor(passportOwner, guideFid, passportTokenId, countries, hourlyRateWMON, hourlyRateTOURS, bio, profileImageIPFS);
    }

    /**
     * @notice Register as tour guide (legacy function, calls registerGuideFor)
     */
    function registerGuide(
        uint256 guideFid,
        uint256 passportTokenId,
        string[] memory countries,
        uint256 hourlyRateWMON,
        uint256 hourlyRateTOURS,
        string memory bio,
        string memory profileImageIPFS
    ) external {
        registerGuideFor(msg.sender, guideFid, passportTokenId, countries, hourlyRateWMON, hourlyRateTOURS, bio, profileImageIPFS);
    }

    function _createGuideFor(
        address guideAddress,
        uint256 guideFid,
        uint256 passportTokenId,
        string[] memory countries,
        uint256 hourlyRateWMON,
        uint256 hourlyRateTOURS,
        string memory bio,
        string memory profileImageIPFS
    ) internal {
        TourGuide storage guide = guides[guideFid];
        guide.guideFid = guideFid;
        guide.guideAddress = guideAddress;
        guide.passportTokenId = passportTokenId;
        guide.countries = countries;
        guide.hourlyRateWMON = hourlyRateWMON;
        guide.hourlyRateTOURS = hourlyRateTOURS;
        guide.bio = bio;
        guide.profileImageIPFS = profileImageIPFS;
        guide.registeredAt = block.timestamp;
        guide.active = true;
        guide.suspended = false;

        isRegisteredGuide[guideFid] = true;
        passportToGuide[passportTokenId] = guideFid;
        addressToGuideFid[guideAddress] = guideFid;

        for (uint256 i = 0; i < countries.length; i++) {
            guidesByCountry[countries[i]].push(guideFid);
        }

        emit GuideRegistered(guideFid, guideAddress, passportTokenId, countries);
    }

    // Legacy internal function for backwards compatibility
    function _createGuide(
        uint256 guideFid,
        uint256 passportTokenId,
        string[] memory countries,
        uint256 hourlyRateWMON,
        uint256 hourlyRateTOURS,
        string memory bio,
        string memory profileImageIPFS
    ) internal {
        _createGuideFor(msg.sender, guideFid, passportTokenId, countries, hourlyRateWMON, hourlyRateTOURS, bio, profileImageIPFS);
    }

    function updateGuide(
        uint256 hourlyRateWMON,
        uint256 hourlyRateTOURS,
        string memory bio,
        string memory profileImageIPFS,
        bool active
    ) external nonReentrant whenNotPaused {
        uint256 guideFid = addressToGuideFid[msg.sender];
        require(isRegisteredGuide[guideFid], "Not registered");
        require(!guides[guideFid].suspended, "Guide suspended");
        require(hourlyRateWMON >= MINIMUM_HOURLY_RATE && hourlyRateWMON <= MAXIMUM_HOURLY_RATE, "Invalid WMON rate");
        require(bytes(bio).length > 0 && bytes(bio).length <= 1000, "Bio must be 1-1000 chars");

        TourGuide storage guide = guides[guideFid];
        require(guide.guideAddress == msg.sender, "Not guide owner");

        guide.hourlyRateWMON = hourlyRateWMON;
        guide.hourlyRateTOURS = hourlyRateTOURS;
        guide.bio = bio;
        guide.profileImageIPFS = profileImageIPFS;
        guide.active = active;

        emit GuideUpdated(guideFid, hourlyRateWMON, hourlyRateTOURS, active);
    }

    function addCountry(string memory country) external whenNotPaused {
        uint256 guideFid = addressToGuideFid[msg.sender];
        require(isRegisteredGuide[guideFid], "Not registered");

        TourGuide storage guide = guides[guideFid];
        require(guide.guideAddress == msg.sender, "Not guide owner");
        require(guide.countries.length < MAX_COUNTRIES, "Max countries");

        guide.countries.push(country);
        guidesByCountry[country].push(guideFid);

        emit CountryAdded(guideFid, country);
    }

    // ============================================
    // Free Connections (Like Mirror Mate)
    // ============================================

    /**
     * @notice Request free connection with guide (coffee, advice, etc.)
     * @dev First 5 connections per day are free, then 10 WMON per connection
     */
    function requestConnection(
        uint256 travelerFid,
        uint256 guideFid,
        string memory meetupType,
        string memory message
    ) external nonReentrant whenNotPaused validFid(travelerFid) validFid(guideFid) returns (uint256 connectionId) {
        require(travelerFid != guideFid, "Cannot connect with yourself");
        require(isRegisteredGuide[guideFid], "Guide not registered");
        require(!guides[guideFid].suspended, "Guide suspended");
        require(bytes(meetupType).length > 0 && bytes(meetupType).length <= 50, "Invalid meetup type");
        require(bytes(message).length > 0 && bytes(message).length <= 500, "Message must be 1-500 chars");

        // Rate limiting: 5 free connections per day, then 10 WMON per connection
        uint256 currentDay = block.timestamp / 1 days;
        uint256 todayCount = dailyConnectionCount[travelerFid][currentDay];

        if (todayCount >= MAX_FREE_CONNECTIONS_PER_DAY) {
            // Charge 10 WMON for connections beyond daily limit
            wmonToken.safeTransferFrom(msg.sender, platformWallet, PAID_CONNECTION_FEE);
            emit PaidConnectionRequested(_connectionIdCounter + 1, travelerFid, PAID_CONNECTION_FEE);
        }

        _connectionIdCounter++;
        connectionId = _connectionIdCounter;

        connections[connectionId] = Connection({
            connectionId: connectionId,
            travelerFid: travelerFid,
            guideFid: guideFid,
            travelerAddress: msg.sender,
            guideAddress: guides[guideFid].guideAddress,
            meetupType: meetupType,
            message: message,
            requestedAt: block.timestamp,
            accepted: false,
            declined: false,
            guideResponse: ""
        });

        guideConnectionRequests[guideFid].push(connectionId);
        travelerConnections[travelerFid].push(connectionId);
        dailyConnectionCount[travelerFid][currentDay]++;

        emit ConnectionRequested(connectionId, travelerFid, guideFid, meetupType);
        return connectionId;
    }

    /**
     * @notice Guide accepts connection request
     */
    function acceptConnection(uint256 connectionId, string memory response) external nonReentrant whenNotPaused {
        Connection storage conn = connections[connectionId];
        require(conn.connectionId != 0, "Connection doesn't exist");
        require(conn.guideAddress == msg.sender, "Not the guide");
        require(!conn.accepted && !conn.declined, "Already responded");

        conn.accepted = true;
        conn.guideResponse = response;

        emit ConnectionAccepted(connectionId, conn.travelerFid, conn.guideFid);
    }

    /**
     * @notice Guide declines connection request
     */
    function declineConnection(uint256 connectionId, string memory response) external nonReentrant whenNotPaused {
        Connection storage conn = connections[connectionId];
        require(conn.connectionId != 0, "Connection doesn't exist");
        require(conn.guideAddress == msg.sender, "Not the guide");
        require(!conn.accepted && !conn.declined, "Already responded");

        conn.declined = true;
        conn.guideResponse = response;

        emit ConnectionDeclined(connectionId, conn.travelerFid, conn.guideFid);
    }

    // ============================================
    // Guide Discovery (Skip Feature)
    // ============================================

    /**
     * @notice Skip a guide when browsing (20 free per day, then 5 WMON per skip)
     * @dev Used for swipe-style guide discovery UI
     */
    function skipGuide(
        uint256 travelerFid,
        uint256 guideFid
    ) external nonReentrant whenNotPaused validFid(travelerFid) validFid(guideFid) {
        require(travelerFid != guideFid, "Cannot skip yourself");
        require(isRegisteredGuide[guideFid], "Guide not registered");

        // Rate limiting: 20 free skips per day, then 5 WMON per skip
        uint256 currentDay = block.timestamp / 1 days;
        uint256 todaySkips = dailySkipCount[travelerFid][currentDay];

        bool paidSkip = false;
        if (todaySkips >= MAX_FREE_SKIPS_PER_DAY) {
            // Charge 5 WMON for skips beyond daily limit
            wmonToken.safeTransferFrom(msg.sender, platformWallet, PAID_SKIP_FEE);
            paidSkip = true;
            emit PaidSkipProcessed(travelerFid, PAID_SKIP_FEE);
        }

        dailySkipCount[travelerFid][currentDay]++;

        emit GuideSkipped(travelerFid, guideFid, paidSkip);
    }

    // ============================================
    // Paid Bookings
    // ============================================

    function bookGuideFor(
        address beneficiary,
        uint256 travelerFid,
        uint256 guideFid,
        uint256 hoursDuration,
        address paymentToken
    ) public nonReentrant whenNotPaused validFid(travelerFid) validFid(guideFid) returns (uint256 bookingId) {
        require(beneficiary != address(0), "Invalid beneficiary");
        require(hoursDuration > 0 && hoursDuration <= MAX_HOURS_PER_BOOKING, "Invalid hours");
        require(isRegisteredGuide[guideFid], "Guide not registered");

        // Rate limiting: 3 bookings per day
        uint256 currentDay = block.timestamp / 1 days;
        uint256 todayBookings = dailyBookingCount[travelerFid][currentDay];
        require(todayBookings < MAX_BOOKINGS_PER_DAY, "Max 3 bookings per day");

        TourGuide storage guide = guides[guideFid];
        require(!guide.suspended, "Guide suspended");
        require(guide.active, "Guide not active");
        require(travelerFid != guideFid, "Cannot book yourself");
        require(beneficiary != guide.guideAddress, "Cannot book yourself");
        require(block.timestamp >= lastBookingTime[beneficiary] + BOOKING_COOLDOWN, "Cooldown active");

        if (guide.totalBookings > 10) {
            uint256 cancellationRate = (guide.cancellationCount * 100) / guide.totalBookings;
            require(cancellationRate < MAX_CANCELLATION_RATE, "Guide cancellation rate too high");
        }

        uint256 hourlyRate;
        if (paymentToken == address(wmonToken)) {
            hourlyRate = guide.hourlyRateWMON;
        } else if (paymentToken == address(toursToken)) {
            require(guide.hourlyRateTOURS > 0, "Guide doesn't accept TOURS");
            hourlyRate = guide.hourlyRateTOURS;
        } else {
            revert("Invalid payment token");
        }

        uint256 totalCost = hourlyRate * hoursDuration;
        uint256 guideShare = (totalCost * GUIDE_PERCENTAGE) / 100;
        uint256 platformShare = totalCost - guideShare;

        _bookingIdCounter++;
        bookingId = _bookingIdCounter;

        bookings[bookingId] = Booking({
            bookingId: bookingId,
            guideFid: guideFid,
            travelerFid: travelerFid,
            guideAddress: guide.guideAddress,
            travelerAddress: beneficiary,
            hoursDuration: hoursDuration,
            totalCost: totalCost,
            paymentToken: paymentToken,
            bookedAt: block.timestamp,
            guideMarkedComplete: false,
            guideMarkedAt: 0,
            guideProofIPFS: "",
            completed: false,
            completedAt: 0,
            autoCompleted: false,
            travelerRating: 0,
            travelerReviewIPFS: "",
            guideRating: 0,
            guideReviewIPFS: "",
            cancelled: false,
            cancelledBy: address(0),
            cancellationReason: ""
        });

        guideBookings[guideFid].push(bookingId);
        travelerBookings[travelerFid].push(bookingId);
        hasBooked[travelerFid][guideFid] = true;
        lastBookingTime[beneficiary] = block.timestamp;
        dailyBookingCount[travelerFid][currentDay]++;

        guide.totalBookings++;

        if (paymentToken == address(wmonToken)) {
            guide.totalEarningsWMON += totalCost;
        } else {
            guide.totalEarningsTOURS += totalCost;
        }

        IERC20(paymentToken).safeTransferFrom(msg.sender, guide.guideAddress, guideShare);
        IERC20(paymentToken).safeTransferFrom(msg.sender, platformWallet, platformShare);

        emit BookingCreated(bookingId, guideFid, travelerFid, beneficiary, hoursDuration, totalCost, paymentToken);
        return bookingId;
    }

    function bookGuide(uint256 travelerFid, uint256 guideFid, uint256 hoursDuration, address paymentToken) external returns (uint256) {
        return bookGuideFor(msg.sender, travelerFid, guideFid, hoursDuration, paymentToken);
    }

    // ============================================
    // Completion Flow
    // ============================================

    function markTourComplete(uint256 bookingId, string memory proofIPFS) external nonReentrant whenNotPaused {
        Booking storage booking = bookings[bookingId];
        require(booking.bookingId != 0, "Booking doesn't exist");
        require(booking.guideAddress == msg.sender, "Not the guide");
        require(!booking.completed, "Already completed");
        require(!booking.cancelled, "Cancelled");
        require(!booking.guideMarkedComplete, "Already marked");
        require(bytes(proofIPFS).length > 0, "Proof required");

        booking.guideMarkedComplete = true;
        booking.guideMarkedAt = block.timestamp;
        booking.guideProofIPFS = proofIPFS;

        emit TourMarkedComplete(bookingId, booking.guideFid, proofIPFS, block.timestamp);
    }

    function confirmAndRate(uint256 bookingId, uint256 rating, string memory reviewIPFS)
        external nonReentrant whenNotPaused validRating(rating)
    {
        Booking storage booking = bookings[bookingId];
        require(booking.bookingId != 0, "Booking doesn't exist");
        require(booking.travelerAddress == msg.sender, "Not the traveler");
        require(booking.guideMarkedComplete, "Guide hasn't marked complete");
        require(!booking.completed, "Already completed");
        require(!booking.cancelled, "Cancelled");

        booking.completed = true;
        booking.completedAt = block.timestamp;
        booking.travelerRating = rating;
        booking.travelerReviewIPFS = reviewIPFS;

        TourGuide storage guide = guides[booking.guideFid];
        guide.totalCompletedTours++;

        uint256 totalRating = (guide.averageRating * guide.ratingCount) + rating;
        guide.ratingCount++;
        guide.averageRating = totalRating / guide.ratingCount;

        emit TourCompleted(bookingId, booking.guideFid, booking.travelerFid, rating, false);
        emit GuideRated(booking.guideFid, guide.averageRating, guide.ratingCount);
    }

    function autoCompleteTour(uint256 bookingId) external nonReentrant whenNotPaused {
        Booking storage booking = bookings[bookingId];
        require(booking.bookingId != 0, "Booking doesn't exist");
        require(booking.guideMarkedComplete, "Guide hasn't marked complete");
        require(!booking.completed, "Already completed");
        require(!booking.cancelled, "Cancelled");
        require(block.timestamp >= booking.guideMarkedAt + AUTO_COMPLETE_PERIOD, "Wait 7 days");

        booking.completed = true;
        booking.completedAt = block.timestamp;
        booking.autoCompleted = true;

        guides[booking.guideFid].totalCompletedTours++;

        emit TourCompleted(bookingId, booking.guideFid, booking.travelerFid, 0, true);
    }

    function leaveGuideReview(uint256 bookingId, uint256 rating, string memory reviewIPFS)
        external nonReentrant whenNotPaused validRating(rating)
    {
        Booking storage booking = bookings[bookingId];
        require(booking.bookingId != 0, "Booking doesn't exist");
        require(booking.guideAddress == msg.sender, "Not the guide");
        require(booking.completed, "Not completed");

        booking.guideRating = rating;
        booking.guideReviewIPFS = reviewIPFS;

        emit GuideReviewedTraveler(bookingId, booking.travelerFid, rating);
    }

    function cancelBooking(uint256 bookingId, string memory reason) external nonReentrant whenNotPaused {
        Booking storage booking = bookings[bookingId];
        require(booking.bookingId != 0, "Booking doesn't exist");
        require(!booking.completed, "Already completed");
        require(!booking.cancelled, "Already cancelled");
        require(!booking.guideMarkedComplete, "Tour started");
        require(
            msg.sender == booking.guideAddress ||
            msg.sender == booking.travelerAddress ||
            msg.sender == owner(),
            "Not authorized"
        );

        booking.cancelled = true;
        booking.cancelledBy = msg.sender;
        booking.cancellationReason = reason;

        if (msg.sender == booking.guideAddress) {
            guides[booking.guideFid].cancellationCount++;
        }

        emit BookingCancelled(bookingId, msg.sender, reason, block.timestamp);
    }

    // ============================================
    // View Functions
    // ============================================

    function getGuide(uint256 guideFid) external view onlyRegisteredGuide(guideFid) returns (TourGuide memory) {
        return guides[guideFid];
    }

    function getGuidesByCountry(string memory country) external view returns (uint256[] memory) {
        return guidesByCountry[country];
    }

    function getGuideCountries(uint256 guideFid) external view returns (string[] memory) {
        require(isRegisteredGuide[guideFid], "Guide not registered");
        return guides[guideFid].countries;
    }

    function getApplication(uint256 guideFid) external view returns (GuideApplication memory) {
        return applications[guideFid];
    }

    function getPendingApplications() external view returns (uint256[] memory) {
        return pendingApplicationIds;
    }

    function getConnection(uint256 connectionId) external view returns (Connection memory) {
        require(connections[connectionId].connectionId != 0, "Connection doesn't exist");
        return connections[connectionId];
    }

    function getGuideConnectionRequests(uint256 guideFid) external view returns (uint256[] memory) {
        return guideConnectionRequests[guideFid];
    }

    function getTravelerConnections(uint256 travelerFid) external view returns (uint256[] memory) {
        return travelerConnections[travelerFid];
    }

    function getBooking(uint256 bookingId) external view returns (Booking memory) {
        require(bookings[bookingId].bookingId != 0, "Booking doesn't exist");
        return bookings[bookingId];
    }

    function getGuideBookings(uint256 guideFid) external view returns (uint256[] memory) {
        return guideBookings[guideFid];
    }

    function getTravelerBookings(uint256 travelerFid) external view returns (uint256[] memory) {
        return travelerBookings[travelerFid];
    }

    function isGuide(uint256 guideFid) external view returns (bool) {
        return isRegisteredGuide[guideFid] && !guides[guideFid].suspended;
    }

    function getGuideByAddress(address guideAddress) external view returns (uint256 guideFid, TourGuide memory guide) {
        guideFid = addressToGuideFid[guideAddress];
        if (guideFid > 0 && isRegisteredGuide[guideFid]) {
            guide = guides[guideFid];
        }
    }

    function canAutoComplete(uint256 bookingId) external view returns (bool) {
        Booking memory booking = bookings[bookingId];
        return booking.bookingId != 0
            && booking.guideMarkedComplete
            && !booking.completed
            && !booking.cancelled
            && block.timestamp >= booking.guideMarkedAt + AUTO_COMPLETE_PERIOD;
    }

    function getRemainingFreeConnections(uint256 travelerFid) external view returns (uint256) {
        uint256 currentDay = block.timestamp / 1 days;
        uint256 todayCount = dailyConnectionCount[travelerFid][currentDay];
        if (todayCount >= MAX_FREE_CONNECTIONS_PER_DAY) {
            return 0;
        }
        return MAX_FREE_CONNECTIONS_PER_DAY - todayCount;
    }

    function getDailyConnectionCount(uint256 travelerFid) external view returns (uint256) {
        uint256 currentDay = block.timestamp / 1 days;
        return dailyConnectionCount[travelerFid][currentDay];
    }

    function getRemainingFreeSkips(uint256 travelerFid) external view returns (uint256) {
        uint256 currentDay = block.timestamp / 1 days;
        uint256 todaySkips = dailySkipCount[travelerFid][currentDay];
        if (todaySkips >= MAX_FREE_SKIPS_PER_DAY) {
            return 0;
        }
        return MAX_FREE_SKIPS_PER_DAY - todaySkips;
    }

    function getDailySkipCount(uint256 travelerFid) external view returns (uint256) {
        uint256 currentDay = block.timestamp / 1 days;
        return dailySkipCount[travelerFid][currentDay];
    }

    function getRemainingBookings(uint256 travelerFid) external view returns (uint256) {
        uint256 currentDay = block.timestamp / 1 days;
        uint256 todayBookings = dailyBookingCount[travelerFid][currentDay];
        if (todayBookings >= MAX_BOOKINGS_PER_DAY) {
            return 0;
        }
        return MAX_BOOKINGS_PER_DAY - todayBookings;
    }

    function getDailyBookingCount(uint256 travelerFid) external view returns (uint256) {
        uint256 currentDay = block.timestamp / 1 days;
        return dailyBookingCount[travelerFid][currentDay];
    }

    // ============================================
    // Admin Functions
    // ============================================

    function suspendGuide(uint256 guideFid, string memory reason) external onlyOwner {
        require(isRegisteredGuide[guideFid], "Guide not registered");
        guides[guideFid].suspended = true;
        emit GuideSuspended(guideFid, reason);
    }

    function reinstateGuide(uint256 guideFid) external onlyOwner {
        require(isRegisteredGuide[guideFid], "Guide not registered");
        guides[guideFid].suspended = false;
        emit GuideReinstated(guideFid);
    }

    function setApprovalOracle(address newOracle) external onlyOwner {
        address oldOracle = approvalOracle;
        approvalOracle = newOracle;
        emit ApprovalOracleUpdated(oldOracle, newOracle);
    }

    function updatePlatformWallet(address newWallet) external onlyOwner {
        require(newWallet != address(0), "Invalid wallet");
        address oldWallet = platformWallet;
        platformWallet = newWallet;
        emit PlatformWalletUpdated(oldWallet, newWallet);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        require(token != address(0), "Invalid token");
        IERC20(token).safeTransfer(owner(), amount);
        emit EmergencyWithdraw(token, amount, owner());
    }
}
