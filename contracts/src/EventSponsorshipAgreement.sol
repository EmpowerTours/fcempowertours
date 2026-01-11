// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

/**
 * @title EventSponsorshipAgreement
 * @notice EmpowerTours Event Oracle - Sponsorship & Attendance System
 *
 * === OVERVIEW ===
 * Sponsors create events. Attendees verify attendance via GPS to receive
 * $TOURS tokens and a Travel Stamp NFT (proof of attendance).
 *
 * === CHECK-IN OPTIONS ===
 * 1. GPS Check-in: RSVP'd users check in directly via app with GPS verification
 * 2. QR Code: Optional for large events where sponsors want to verify physically
 *
 * === ACCESS CONTROL ===
 * - Open Events: Anyone can attend and check in
 * - Invite-Only: Sponsor invites users → Users accept (RSVP) → Check in with GPS
 *
 * === FLOW ===
 * For invite-only events:
 * 1. Sponsor creates event (open or invite-only)
 * 2. Sponsor invites wallets: inviteUsers(eventId, [addresses])
 * 3. Users accept invite: acceptInvite(eventId) - links their wallet
 * 4. At event, users check in: checkInWithGPS(eventId, fid, lat, lng)
 * 5. Users claim rewards: $TOURS + Travel Stamp NFT
 *
 * For open events:
 * 1. Sponsor creates open event
 * 2. Anyone can check in with GPS at venue
 *
 * === SPONSOR TIERS (via SponsorWhitelist) ===
 * - Pioneer: 0% fee (La Mille - first sponsor)
 * - Founding: 2.5% fee (first 10 sponsors)
 * - Partner: 3.75% fee (first 50 sponsors)
 * - Standard: 5% fee
 */

// Interface for SponsorWhitelist integration
interface ISponsorWhitelist {
    function getSponsorFee(address sponsor) external view returns (uint256);
    function isPioneer(address sponsor) external view returns (bool);
    function recordStamp(address user, uint256 eventId) external;
    function addToWhitelist(address[] calldata users) external;
}
contract EventSponsorshipAgreement is ERC721, ERC721URIStorage, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============================================
    // Constants
    // ============================================
    uint256 public constant MIN_SPONSORSHIP = 100 ether;      // 100 MON minimum
    uint256 public constant PLATFORM_FEE_BPS = 500;           // 5% platform fee
    uint256 public constant MAX_ATTENDEES = 10000;            // Max per event
    uint256 public constant GPS_RADIUS_METERS = 500;          // 500m check-in radius

    // ============================================
    // State Variables
    // ============================================
    IERC20 public wmonToken;
    IERC20 public toursToken;
    address public platformWallet;
    address public oracle;         // Backend oracle for GPS verification

    uint256 private _eventIdCounter;
    uint256 private _stampIdCounter;

    // ============================================
    // Enums
    // ============================================
    enum EventStatus { Pending, Active, Completed, Cancelled, Refunded }
    enum EventType { Gala, Conference, Festival, Meetup, Custom }

    // ============================================
    // Structs
    // ============================================
    struct SponsoredEvent {
        uint256 eventId;
        string name;
        string description;
        EventType eventType;
        EventStatus status;

        // Sponsor info
        address sponsor;
        uint256 sponsorFid;         // Farcaster ID
        string sponsorName;         // Company/brand name
        string sponsorLogoIPFS;     // Logo IPFS hash

        // Funding
        uint256 totalDeposit;       // Total MON deposited
        uint256 wmonRewardPerUser;  // WMON per attendee
        uint256 toursRewardPerUser; // TOURS per attendee
        uint256 remainingFunds;     // Undistributed funds

        // Location (GPS coordinates * 1e6 for precision)
        string venueName;
        string venueAddress;
        string city;
        string country;
        int256 latitude;
        int256 longitude;
        string googlePlaceId;

        // Timing
        uint256 eventDate;          // Unix timestamp
        uint256 checkInStart;       // When check-ins open
        uint256 checkInEnd;         // When check-ins close
        uint256 createdAt;

        // Capacity
        uint256 maxAttendees;
        uint256 checkedInCount;

        // Stamp NFT metadata
        string stampImageIPFS;      // AI-generated stamp image
        string stampName;           // e.g., "Rendez-vous Gala Mexico 2026"

        // Access control
        bool isOpenEvent;           // true = anyone can attend, false = invite only
    }

    struct Attendee {
        address userAddress;
        uint256 userFid;            // Farcaster ID
        uint256 checkInTime;
        int256 checkInLatitude;
        int256 checkInLongitude;
        bool gpsVerified;
        bool rewardsClaimed;
        uint256 stampTokenId;       // Travel Stamp NFT ID
    }

    // ============================================
    // Mappings
    // ============================================
    mapping(uint256 => SponsoredEvent) public events;
    mapping(uint256 => mapping(address => Attendee)) public eventAttendees;
    mapping(uint256 => address[]) public eventAttendeeList;
    mapping(address => uint256[]) public userEventsAttended;
    mapping(uint256 => mapping(uint256 => bool)) public fidCheckedIn; // eventId => fid => checked in
    mapping(address => bool) public trustedVerifiers;

    // QR Code tracking (hash of QR secret => eventId)
    mapping(bytes32 => uint256) public qrCodeToEvent;
    mapping(uint256 => bytes32[]) public eventQRCodes;

    // Invite/RSVP System
    mapping(uint256 => mapping(address => bool)) public eventInvited;    // eventId => user => invited
    mapping(uint256 => mapping(address => bool)) public eventRSVP;       // eventId => user => accepted invite
    mapping(uint256 => address[]) public eventInviteList;                // eventId => invited addresses
    mapping(uint256 => address[]) public eventRSVPList;                  // eventId => RSVP'd addresses

    // ============================================
    // Events
    // ============================================
    event EventCreated(
        uint256 indexed eventId,
        address indexed sponsor,
        string name,
        uint256 totalDeposit,
        uint256 eventDate,
        string city,
        string country
    );

    event EventActivated(uint256 indexed eventId, uint256 timestamp);
    event EventCompleted(uint256 indexed eventId, uint256 totalAttendees, uint256 fundsDistributed);
    event EventCancelled(uint256 indexed eventId, uint256 refundAmount);

    event AttendeeCheckedIn(
        uint256 indexed eventId,
        address indexed user,
        uint256 indexed userFid,
        bool gpsVerified,
        uint256 timestamp
    );

    event RewardsClaimed(
        uint256 indexed eventId,
        address indexed user,
        uint256 wmonAmount,
        uint256 toursAmount,
        uint256 stampTokenId
    );

    event StampMinted(
        uint256 indexed tokenId,
        uint256 indexed eventId,
        address indexed user,
        string eventName
    );

    event QRCodeGenerated(uint256 indexed eventId, bytes32 qrHash, uint256 index);
    event OracleUpdated(address indexed newOracle);
    event VerifierAdded(address indexed verifier);
    event VerifierRemoved(address indexed verifier);

    // Invite/RSVP events
    event InviteSent(uint256 indexed eventId, address indexed user, address indexed inviter);
    event RSVPAccepted(uint256 indexed eventId, address indexed user, uint256 timestamp);

    // ============================================
    // Constructor
    // ============================================
    constructor(
        address _wmonToken,
        address _toursToken,
        address _platformWallet,
        address _oracle
    )
        ERC721("EmpowerTours Travel Stamp", "ETSTAMP")
        Ownable(msg.sender)
    {
        require(_wmonToken != address(0), "Invalid WMON");
        require(_toursToken != address(0), "Invalid TOURS");
        require(_platformWallet != address(0), "Invalid platform wallet");
        require(_oracle != address(0), "Invalid oracle");

        wmonToken = IERC20(_wmonToken);
        toursToken = IERC20(_toursToken);
        platformWallet = _platformWallet;
        oracle = _oracle;

        trustedVerifiers[msg.sender] = true;
        trustedVerifiers[_oracle] = true;
    }

    // ============================================
    // Sponsor Functions
    // ============================================

    /**
     * @notice Create a sponsored event
     * @param name Event name
     * @param description Event description
     * @param eventType Type of event
     * @param sponsorName Company/brand name
     * @param sponsorLogoIPFS Logo IPFS hash
     * @param depositAmount MON to deposit for rewards
     * @param venueName Name of venue
     * @param venueAddress Full address
     * @param city City name
     * @param country Country name
     * @param latitude GPS latitude * 1e6
     * @param longitude GPS longitude * 1e6
     * @param googlePlaceId Google Maps place ID
     * @param eventDate Unix timestamp of event
     * @param maxAttendees Maximum attendees
     * @param wmonPerUser WMON reward per attendee
     * @param toursPerUser TOURS reward per attendee
     */
    function createEvent(
        string memory name,
        string memory description,
        EventType eventType,
        uint256 sponsorFid,
        string memory sponsorName,
        string memory sponsorLogoIPFS,
        uint256 depositAmount,
        string memory venueName,
        string memory venueAddress,
        string memory city,
        string memory country,
        int256 latitude,
        int256 longitude,
        string memory googlePlaceId,
        uint256 eventDate,
        uint256 maxAttendees,
        uint256 wmonPerUser,
        uint256 toursPerUser
    ) external nonReentrant returns (uint256) {
        require(depositAmount >= MIN_SPONSORSHIP, "Deposit below minimum");
        require(maxAttendees > 0 && maxAttendees <= MAX_ATTENDEES, "Invalid attendee count");
        require(eventDate > block.timestamp, "Event must be in future");
        require(wmonPerUser > 0 || toursPerUser > 0, "Must have rewards");

        // Verify sufficient funds for max attendees
        uint256 totalWmonNeeded = wmonPerUser * maxAttendees;
        require(depositAmount >= totalWmonNeeded, "Deposit insufficient for rewards");

        // Transfer deposit from sponsor
        wmonToken.safeTransferFrom(msg.sender, address(this), depositAmount);

        // Take platform fee
        uint256 platformFee = (depositAmount * PLATFORM_FEE_BPS) / 10000;
        uint256 netDeposit = depositAmount - platformFee;
        wmonToken.safeTransfer(platformWallet, platformFee);

        _eventIdCounter++;
        uint256 eventId = _eventIdCounter;

        events[eventId] = SponsoredEvent({
            eventId: eventId,
            name: name,
            description: description,
            eventType: eventType,
            status: EventStatus.Pending,
            sponsor: msg.sender,
            sponsorFid: sponsorFid,
            sponsorName: sponsorName,
            sponsorLogoIPFS: sponsorLogoIPFS,
            totalDeposit: netDeposit,
            wmonRewardPerUser: wmonPerUser,
            toursRewardPerUser: toursPerUser,
            remainingFunds: netDeposit,
            venueName: venueName,
            venueAddress: venueAddress,
            city: city,
            country: country,
            latitude: latitude,
            longitude: longitude,
            googlePlaceId: googlePlaceId,
            eventDate: eventDate,
            checkInStart: eventDate - 1 hours,  // Check-in starts 1 hour before
            checkInEnd: eventDate + 6 hours,     // Check-in ends 6 hours after
            createdAt: block.timestamp,
            maxAttendees: maxAttendees,
            checkedInCount: 0,
            stampImageIPFS: "",
            stampName: name,
            isOpenEvent: true  // Default to open event
        });

        emit EventCreated(eventId, msg.sender, name, netDeposit, eventDate, city, country);
        return eventId;
    }

    /**
     * @notice Create a simple event (TOURS rewards only, no deposit required)
     * @dev For community events where sponsor doesn't deposit MON
     */
    function createSimpleEvent(
        string memory name,
        string memory description,
        EventType eventType,
        uint256 sponsorFid,
        string memory sponsorName,
        string memory sponsorLogoIPFS,
        string memory venueName,
        string memory city,
        string memory country,
        int256 latitude,
        int256 longitude,
        uint256 eventDate,
        uint256 maxAttendees,
        uint256 toursPerUser,
        bool isOpenEvent
    ) external returns (uint256) {
        require(maxAttendees > 0 && maxAttendees <= MAX_ATTENDEES, "Invalid attendee count");
        require(eventDate > block.timestamp, "Event must be in future");

        _eventIdCounter++;
        uint256 eventId = _eventIdCounter;

        events[eventId] = SponsoredEvent({
            eventId: eventId,
            name: name,
            description: description,
            eventType: eventType,
            status: EventStatus.Active,  // Auto-activate simple events
            sponsor: msg.sender,
            sponsorFid: sponsorFid,
            sponsorName: sponsorName,
            sponsorLogoIPFS: sponsorLogoIPFS,
            totalDeposit: 0,
            wmonRewardPerUser: 0,
            toursRewardPerUser: toursPerUser,
            remainingFunds: 0,
            venueName: venueName,
            venueAddress: "",
            city: city,
            country: country,
            latitude: latitude,
            longitude: longitude,
            googlePlaceId: "",
            eventDate: eventDate,
            checkInStart: eventDate - 1 hours,
            checkInEnd: eventDate + 6 hours,
            createdAt: block.timestamp,
            maxAttendees: maxAttendees,
            checkedInCount: 0,
            stampImageIPFS: "",
            stampName: name,
            isOpenEvent: isOpenEvent
        });

        emit EventCreated(eventId, msg.sender, name, 0, eventDate, city, country);
        return eventId;
    }

    /**
     * @notice Set the AI-generated stamp image for event
     */
    function setStampImage(
        uint256 eventId,
        string memory stampImageIPFS,
        string memory stampName
    ) external {
        SponsoredEvent storage evt = events[eventId];
        require(evt.eventId != 0, "Event not found");
        require(
            msg.sender == evt.sponsor ||
            msg.sender == owner() ||
            msg.sender == oracle,
            "Unauthorized"
        );

        evt.stampImageIPFS = stampImageIPFS;
        if (bytes(stampName).length > 0) {
            evt.stampName = stampName;
        }
    }

    /**
     * @notice Activate event (makes check-ins possible)
     */
    function activateEvent(uint256 eventId) external {
        SponsoredEvent storage evt = events[eventId];
        require(evt.eventId != 0, "Event not found");
        require(evt.status == EventStatus.Pending, "Invalid status");
        require(
            msg.sender == evt.sponsor ||
            msg.sender == owner() ||
            msg.sender == oracle,
            "Unauthorized"
        );

        evt.status = EventStatus.Active;
        emit EventActivated(eventId, block.timestamp);
    }

    /**
     * @notice Toggle event between open and invite-only
     */
    function setEventAccess(uint256 eventId, bool isOpen) external {
        SponsoredEvent storage evt = events[eventId];
        require(evt.eventId != 0, "Event not found");
        require(msg.sender == evt.sponsor || msg.sender == owner(), "Unauthorized");
        evt.isOpenEvent = isOpen;
    }

    // ============================================
    // Invite/RSVP Functions
    // ============================================

    /**
     * @notice Invite users to event (sponsor only)
     * @param eventId Event to invite to
     * @param users Array of wallet addresses to invite
     */
    function inviteUsers(uint256 eventId, address[] calldata users) external {
        SponsoredEvent storage evt = events[eventId];
        require(evt.eventId != 0, "Event not found");
        require(msg.sender == evt.sponsor || msg.sender == owner() || msg.sender == oracle, "Unauthorized");

        for (uint256 i = 0; i < users.length; i++) {
            if (!eventInvited[eventId][users[i]]) {
                eventInvited[eventId][users[i]] = true;
                eventInviteList[eventId].push(users[i]);
                emit InviteSent(eventId, users[i], msg.sender);
            }
        }
    }

    /**
     * @notice Accept invite to event (RSVP)
     * @dev User calls this to confirm attendance - links their wallet
     * @param eventId Event to RSVP to
     */
    function acceptInvite(uint256 eventId) external {
        SponsoredEvent storage evt = events[eventId];
        require(evt.eventId != 0, "Event not found");
        require(evt.status == EventStatus.Active || evt.status == EventStatus.Pending, "Event not accepting RSVPs");
        require(block.timestamp < evt.eventDate, "Event already started");

        // For invite-only events, user must be invited
        if (!evt.isOpenEvent) {
            require(eventInvited[eventId][msg.sender], "Not invited");
        }

        require(!eventRSVP[eventId][msg.sender], "Already RSVP'd");

        eventRSVP[eventId][msg.sender] = true;
        eventRSVPList[eventId].push(msg.sender);

        emit RSVPAccepted(eventId, msg.sender, block.timestamp);
    }

    /**
     * @notice Check if user can check in to event
     * @return canCheckIn True if user is allowed to check in
     */
    function canUserCheckIn(uint256 eventId, address user) public view returns (bool canCheckIn) {
        SponsoredEvent storage evt = events[eventId];
        if (evt.eventId == 0) return false;
        if (evt.status != EventStatus.Active) return false;

        // Open events: anyone can check in
        if (evt.isOpenEvent) return true;

        // Invite-only: must have RSVP'd
        return eventRSVP[eventId][user];
    }

    /**
     * @notice Get invite list for event
     */
    function getInviteList(uint256 eventId) external view returns (address[] memory) {
        return eventInviteList[eventId];
    }

    /**
     * @notice Get RSVP list for event
     */
    function getRSVPList(uint256 eventId) external view returns (address[] memory) {
        return eventRSVPList[eventId];
    }

    /**
     * @notice Cancel event and refund sponsor
     *
     * ESCROW PROTECTION:
     * - If cancelled >7 days before event: 100% refund
     * - If cancelled 3-7 days before: 90% refund (10% to platform as penalty)
     * - If cancelled <3 days before: 75% refund (25% penalty)
     * - If cancelled after check-in starts: NO REFUND (funds distributed to checked-in attendees)
     * - Cannot cancel if anyone has already checked in
     */
    function cancelEvent(uint256 eventId) external nonReentrant {
        SponsoredEvent storage evt = events[eventId];
        require(evt.eventId != 0, "Event not found");
        require(evt.status == EventStatus.Pending || evt.status == EventStatus.Active, "Cannot cancel");
        require(msg.sender == evt.sponsor || msg.sender == owner(), "Unauthorized");
        require(evt.checkedInCount == 0, "Cannot cancel after check-ins");

        uint256 refundAmount = evt.remainingFunds;
        uint256 penaltyAmount = 0;

        // Calculate cancellation penalty based on timing
        uint256 timeUntilEvent = evt.eventDate > block.timestamp ? evt.eventDate - block.timestamp : 0;

        if (timeUntilEvent < 3 days) {
            // Late cancellation: 25% penalty
            penaltyAmount = (refundAmount * 2500) / 10000;
        } else if (timeUntilEvent < 7 days) {
            // Medium notice: 10% penalty
            penaltyAmount = (refundAmount * 1000) / 10000;
        }
        // > 7 days: no penalty

        refundAmount = refundAmount - penaltyAmount;
        evt.remainingFunds = 0;
        evt.status = EventStatus.Cancelled;

        // Transfer penalty to platform
        if (penaltyAmount > 0) {
            wmonToken.safeTransfer(platformWallet, penaltyAmount);
        }

        // Refund remaining to sponsor
        if (refundAmount > 0) {
            wmonToken.safeTransfer(evt.sponsor, refundAmount);
        }

        emit EventCancelled(eventId, refundAmount);
    }

    // ============================================
    // QR Code Management
    // ============================================

    /**
     * @notice Generate QR codes for event (oracle only)
     * @dev Each QR contains a unique secret that hashes to qrHash
     */
    function generateQRCodes(
        uint256 eventId,
        bytes32[] calldata qrHashes
    ) external {
        require(msg.sender == oracle || msg.sender == owner(), "Unauthorized");
        SponsoredEvent storage evt = events[eventId];
        require(evt.eventId != 0, "Event not found");

        for (uint256 i = 0; i < qrHashes.length; i++) {
            require(qrCodeToEvent[qrHashes[i]] == 0, "QR already used");
            qrCodeToEvent[qrHashes[i]] = eventId;
            eventQRCodes[eventId].push(qrHashes[i]);
            emit QRCodeGenerated(eventId, qrHashes[i], eventQRCodes[eventId].length - 1);
        }
    }

    // ============================================
    // Check-in Functions
    // ============================================

    /**
     * @notice Check in to event with QR code and GPS verification
     * @param eventId Event to check into
     * @param userFid User's Farcaster ID
     * @param qrSecret Secret from scanned QR code
     * @param latitude User's GPS latitude * 1e6
     * @param longitude User's GPS longitude * 1e6
     */
    function checkIn(
        uint256 eventId,
        uint256 userFid,
        bytes32 qrSecret,
        int256 latitude,
        int256 longitude
    ) external nonReentrant {
        SponsoredEvent storage evt = events[eventId];
        require(evt.eventId != 0, "Event not found");
        require(evt.status == EventStatus.Active, "Event not active");
        require(block.timestamp >= evt.checkInStart, "Check-in not open");
        require(block.timestamp <= evt.checkInEnd, "Check-in closed");
        require(evt.checkedInCount < evt.maxAttendees, "Event full");
        require(!fidCheckedIn[eventId][userFid], "Already checked in");
        require(eventAttendees[eventId][msg.sender].checkInTime == 0, "Address already checked in");

        // Verify QR code
        bytes32 qrHash = keccak256(abi.encodePacked(qrSecret));
        require(qrCodeToEvent[qrHash] == eventId, "Invalid QR code");

        // Verify GPS (within radius)
        bool gpsVerified = _verifyGPS(evt.latitude, evt.longitude, latitude, longitude);

        // Record attendance
        eventAttendees[eventId][msg.sender] = Attendee({
            userAddress: msg.sender,
            userFid: userFid,
            checkInTime: block.timestamp,
            checkInLatitude: latitude,
            checkInLongitude: longitude,
            gpsVerified: gpsVerified,
            rewardsClaimed: false,
            stampTokenId: 0
        });

        eventAttendeeList[eventId].push(msg.sender);
        userEventsAttended[msg.sender].push(eventId);
        fidCheckedIn[eventId][userFid] = true;
        evt.checkedInCount++;

        emit AttendeeCheckedIn(eventId, msg.sender, userFid, gpsVerified, block.timestamp);
    }

    /**
     * @notice GPS-only check-in for RSVP'd users (no QR needed)
     * @dev Users who accepted invite can check in directly via app with GPS
     * @param eventId Event to check into
     * @param userFid User's Farcaster ID
     * @param latitude User's GPS latitude * 1e6
     * @param longitude User's GPS longitude * 1e6
     */
    function checkInWithGPS(
        uint256 eventId,
        uint256 userFid,
        int256 latitude,
        int256 longitude
    ) external nonReentrant {
        SponsoredEvent storage evt = events[eventId];
        require(evt.eventId != 0, "Event not found");
        require(evt.status == EventStatus.Active, "Event not active");
        require(block.timestamp >= evt.checkInStart, "Check-in not open");
        require(block.timestamp <= evt.checkInEnd, "Check-in closed");
        require(evt.checkedInCount < evt.maxAttendees, "Event full");
        require(!fidCheckedIn[eventId][userFid], "Already checked in");
        require(eventAttendees[eventId][msg.sender].checkInTime == 0, "Address already checked in");

        // Verify user can check in (open event OR has RSVP'd)
        require(canUserCheckIn(eventId, msg.sender), "Must RSVP first or event is invite-only");

        // Verify GPS (within radius)
        bool gpsVerified = _verifyGPS(evt.latitude, evt.longitude, latitude, longitude);
        require(gpsVerified, "Not within venue radius");

        // Record attendance
        eventAttendees[eventId][msg.sender] = Attendee({
            userAddress: msg.sender,
            userFid: userFid,
            checkInTime: block.timestamp,
            checkInLatitude: latitude,
            checkInLongitude: longitude,
            gpsVerified: true,
            rewardsClaimed: false,
            stampTokenId: 0
        });

        eventAttendeeList[eventId].push(msg.sender);
        userEventsAttended[msg.sender].push(eventId);
        fidCheckedIn[eventId][userFid] = true;
        evt.checkedInCount++;

        emit AttendeeCheckedIn(eventId, msg.sender, userFid, true, block.timestamp);
    }

    /**
     * @notice Oracle-assisted check-in (for users without wallet)
     */
    function checkInFor(
        uint256 eventId,
        address user,
        uint256 userFid,
        int256 latitude,
        int256 longitude,
        bool gpsVerified
    ) external nonReentrant {
        require(trustedVerifiers[msg.sender], "Not authorized verifier");

        SponsoredEvent storage evt = events[eventId];
        require(evt.eventId != 0, "Event not found");
        require(evt.status == EventStatus.Active, "Event not active");
        require(evt.checkedInCount < evt.maxAttendees, "Event full");
        require(!fidCheckedIn[eventId][userFid], "FID already checked in");
        require(eventAttendees[eventId][user].checkInTime == 0, "Address already checked in");

        eventAttendees[eventId][user] = Attendee({
            userAddress: user,
            userFid: userFid,
            checkInTime: block.timestamp,
            checkInLatitude: latitude,
            checkInLongitude: longitude,
            gpsVerified: gpsVerified,
            rewardsClaimed: false,
            stampTokenId: 0
        });

        eventAttendeeList[eventId].push(user);
        userEventsAttended[user].push(eventId);
        fidCheckedIn[eventId][userFid] = true;
        evt.checkedInCount++;

        emit AttendeeCheckedIn(eventId, user, userFid, gpsVerified, block.timestamp);
    }

    // ============================================
    // Reward Distribution
    // ============================================

    /**
     * @notice Claim rewards and mint Travel Stamp NFT
     */
    function claimRewards(uint256 eventId) external nonReentrant {
        SponsoredEvent storage evt = events[eventId];
        Attendee storage attendee = eventAttendees[eventId][msg.sender];

        require(evt.eventId != 0, "Event not found");
        require(attendee.checkInTime > 0, "Not checked in");
        require(!attendee.rewardsClaimed, "Already claimed");
        require(attendee.gpsVerified, "GPS not verified");
        require(block.timestamp > evt.checkInEnd, "Wait until event ends");

        attendee.rewardsClaimed = true;

        // Mint Travel Stamp NFT
        _stampIdCounter++;
        uint256 stampId = _stampIdCounter;
        _safeMint(msg.sender, stampId);

        // Set stamp metadata
        string memory stampUri = string(abi.encodePacked(
            "ipfs://", evt.stampImageIPFS
        ));
        _setTokenURI(stampId, stampUri);
        attendee.stampTokenId = stampId;

        emit StampMinted(stampId, eventId, msg.sender, evt.name);

        // Distribute WMON rewards
        uint256 wmonReward = evt.wmonRewardPerUser;
        if (wmonReward > 0 && evt.remainingFunds >= wmonReward) {
            evt.remainingFunds -= wmonReward;
            wmonToken.safeTransfer(msg.sender, wmonReward);
        }

        // Distribute TOURS rewards (from platform allocation)
        uint256 toursReward = evt.toursRewardPerUser;
        if (toursReward > 0) {
            uint256 toursBalance = toursToken.balanceOf(address(this));
            if (toursBalance >= toursReward) {
                toursToken.safeTransfer(msg.sender, toursReward);
            }
        }

        emit RewardsClaimed(eventId, msg.sender, wmonReward, toursReward, stampId);
    }

    /**
     * @notice Batch claim rewards for multiple attendees (oracle)
     */
    function batchClaimRewards(
        uint256 eventId,
        address[] calldata attendees
    ) external nonReentrant {
        require(trustedVerifiers[msg.sender], "Not authorized");

        SponsoredEvent storage evt = events[eventId];
        require(evt.eventId != 0, "Event not found");
        require(block.timestamp > evt.checkInEnd, "Wait until event ends");

        for (uint256 i = 0; i < attendees.length; i++) {
            _processRewardClaim(eventId, attendees[i]);
        }
    }

    function _processRewardClaim(uint256 eventId, address user) internal {
        SponsoredEvent storage evt = events[eventId];
        Attendee storage attendee = eventAttendees[eventId][user];

        if (attendee.checkInTime == 0 || attendee.rewardsClaimed || !attendee.gpsVerified) {
            return; // Skip invalid claims
        }

        attendee.rewardsClaimed = true;

        // Mint stamp
        _stampIdCounter++;
        uint256 stampId = _stampIdCounter;
        _safeMint(user, stampId);
        _setTokenURI(stampId, string(abi.encodePacked("ipfs://", evt.stampImageIPFS)));
        attendee.stampTokenId = stampId;

        emit StampMinted(stampId, eventId, user, evt.name);

        // WMON reward
        uint256 wmonReward = evt.wmonRewardPerUser;
        if (wmonReward > 0 && evt.remainingFunds >= wmonReward) {
            evt.remainingFunds -= wmonReward;
            wmonToken.safeTransfer(user, wmonReward);
        }

        // TOURS reward
        uint256 toursReward = evt.toursRewardPerUser;
        if (toursReward > 0) {
            uint256 toursBalance = toursToken.balanceOf(address(this));
            if (toursBalance >= toursReward) {
                toursToken.safeTransfer(user, toursReward);
            }
        }

        emit RewardsClaimed(eventId, user, wmonReward, toursReward, stampId);
    }

    /**
     * @notice Complete event and return unused funds to sponsor
     */
    function completeEvent(uint256 eventId) external nonReentrant {
        SponsoredEvent storage evt = events[eventId];
        require(evt.eventId != 0, "Event not found");
        require(evt.status == EventStatus.Active, "Not active");
        require(block.timestamp > evt.checkInEnd + 1 days, "Too early");
        require(
            msg.sender == evt.sponsor ||
            msg.sender == owner() ||
            msg.sender == oracle,
            "Unauthorized"
        );

        evt.status = EventStatus.Completed;

        // Return unused funds to sponsor
        uint256 refund = evt.remainingFunds;
        if (refund > 0) {
            evt.remainingFunds = 0;
            wmonToken.safeTransfer(evt.sponsor, refund);
        }

        uint256 distributed = evt.totalDeposit - refund;
        emit EventCompleted(eventId, evt.checkedInCount, distributed);
    }

    // ============================================
    // GPS Verification Helper
    // ============================================

    /**
     * @notice Verify GPS coordinates are within radius
     * @dev Uses simple distance approximation (good enough for ~500m)
     */
    function _verifyGPS(
        int256 venueLat,
        int256 venueLon,
        int256 userLat,
        int256 userLon
    ) internal pure returns (bool) {
        // Coordinates are scaled by 1e6
        // 1 degree latitude ≈ 111,000 meters
        // At 0° latitude, 1 degree longitude ≈ 111,000 meters
        // Formula: distance = sqrt((dlat*111000)^2 + (dlon*111000*cos(lat))^2)
        // Simplified: just check if both deltas are within threshold

        int256 latDiff = venueLat - userLat;
        if (latDiff < 0) latDiff = -latDiff;

        int256 lonDiff = venueLon - userLon;
        if (lonDiff < 0) lonDiff = -lonDiff;

        // 500m ≈ 0.0045 degrees ≈ 4500 when scaled by 1e6
        // Being generous with 5000 to account for GPS drift
        uint256 threshold = 5000;

        return uint256(latDiff) <= threshold && uint256(lonDiff) <= threshold;
    }

    // ============================================
    // View Functions
    // ============================================

    function getEvent(uint256 eventId) external view returns (SponsoredEvent memory) {
        return events[eventId];
    }

    function getAttendee(uint256 eventId, address user) external view returns (Attendee memory) {
        return eventAttendees[eventId][user];
    }

    function getEventAttendees(uint256 eventId) external view returns (address[] memory) {
        return eventAttendeeList[eventId];
    }

    function getUserEvents(address user) external view returns (uint256[] memory) {
        return userEventsAttended[user];
    }

    function getEventQRCodes(uint256 eventId) external view returns (bytes32[] memory) {
        return eventQRCodes[eventId];
    }

    function isCheckedIn(uint256 eventId, address user) external view returns (bool) {
        return eventAttendees[eventId][user].checkInTime > 0;
    }

    function isCheckedInByFid(uint256 eventId, uint256 fid) external view returns (bool) {
        return fidCheckedIn[eventId][fid];
    }

    function getTotalEvents() external view returns (uint256) {
        return _eventIdCounter;
    }

    function getTotalStamps() external view returns (uint256) {
        return _stampIdCounter;
    }

    // ============================================
    // Admin Functions
    // ============================================

    function setOracle(address newOracle) external onlyOwner {
        require(newOracle != address(0), "Invalid oracle");
        oracle = newOracle;
        trustedVerifiers[newOracle] = true;
        emit OracleUpdated(newOracle);
    }

    function addVerifier(address verifier) external onlyOwner {
        require(verifier != address(0), "Invalid verifier");
        trustedVerifiers[verifier] = true;
        emit VerifierAdded(verifier);
    }

    function removeVerifier(address verifier) external onlyOwner {
        trustedVerifiers[verifier] = false;
        emit VerifierRemoved(verifier);
    }

    function updatePlatformWallet(address newWallet) external onlyOwner {
        require(newWallet != address(0), "Invalid wallet");
        platformWallet = newWallet;
    }

    function depositTOURS(uint256 amount) external {
        toursToken.safeTransferFrom(msg.sender, address(this), amount);
    }

    function withdrawExcessTOURS(uint256 amount) external onlyOwner {
        toursToken.safeTransfer(owner(), amount);
    }

    function emergencyWithdraw() external onlyOwner {
        uint256 wmonBalance = wmonToken.balanceOf(address(this));
        uint256 toursBalance = toursToken.balanceOf(address(this));

        if (wmonBalance > 0) {
            wmonToken.safeTransfer(owner(), wmonBalance);
        }
        if (toursBalance > 0) {
            toursToken.safeTransfer(owner(), toursBalance);
        }
    }

    // ============================================
    // ERC721 Overrides
    // ============================================

    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
