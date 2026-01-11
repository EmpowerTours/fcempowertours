// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

/**
 * @title EventOracleLite
 * @notice Lightweight Event Oracle for testnet - La Mille Gala
 *
 * Features:
 * - Event creation (no deposit required for testnet)
 * - Invite/RSVP system with wallet linking
 * - GPS check-in verification
 * - Travel Stamp NFT minting
 *
 * For mainnet, use the full EventSponsorshipAgreement with escrow.
 */
contract EventOracleLite is ERC721, ERC721URIStorage, Ownable, ReentrancyGuard {

    uint256 public constant GPS_RADIUS_METERS = 500;
    uint256 public constant MAX_ATTENDEES = 1000;

    uint256 private _eventIdCounter;
    uint256 private _stampIdCounter;

    enum EventStatus { Active, Completed, Cancelled }

    struct Event {
        uint256 eventId;
        string name;
        string description;
        EventStatus status;
        address sponsor;
        uint256 sponsorFid;
        string sponsorName;
        string sponsorLogoIPFS;
        string city;
        string country;
        int256 latitude;
        int256 longitude;
        uint256 eventDate;
        uint256 checkInStart;
        uint256 checkInEnd;
        uint256 maxAttendees;
        uint256 checkedInCount;
        string stampImageIPFS;
        bool isOpenEvent;
    }

    struct Attendee {
        address userAddress;
        uint256 userFid;
        uint256 checkInTime;
        bool gpsVerified;
        uint256 stampTokenId;
    }

    // Storage
    mapping(uint256 => Event) public events;
    mapping(uint256 => mapping(address => Attendee)) public attendees;
    mapping(uint256 => address[]) public attendeeList;
    mapping(uint256 => mapping(address => bool)) public eventInvited;
    mapping(uint256 => mapping(address => bool)) public eventRSVP;
    mapping(uint256 => address[]) public rsvpList;
    mapping(address => uint256[]) public userStamps;
    mapping(address => bool) public trustedOracles;

    // Events
    event EventCreated(uint256 indexed eventId, address indexed sponsor, string name, string city);
    event InviteSent(uint256 indexed eventId, address indexed user);
    event RSVPAccepted(uint256 indexed eventId, address indexed user);
    event CheckedIn(uint256 indexed eventId, address indexed user, bool gpsVerified);
    event StampMinted(uint256 indexed tokenId, uint256 indexed eventId, address indexed user);

    constructor() ERC721("EmpowerTours Travel Stamp", "ETSTAMP") Ownable(msg.sender) {
        trustedOracles[msg.sender] = true;
    }

    // ============================================
    // Event Management
    // ============================================

    function createEvent(
        string memory name,
        string memory description,
        uint256 sponsorFid,
        string memory sponsorName,
        string memory sponsorLogoIPFS,
        string memory city,
        string memory country,
        int256 latitude,
        int256 longitude,
        uint256 eventDate,
        uint256 maxAttendees,
        bool isOpenEvent
    ) external returns (uint256) {
        require(maxAttendees > 0 && maxAttendees <= MAX_ATTENDEES, "Invalid attendees");
        require(eventDate > block.timestamp, "Must be future");

        _eventIdCounter++;
        uint256 eventId = _eventIdCounter;

        events[eventId] = Event({
            eventId: eventId,
            name: name,
            description: description,
            status: EventStatus.Active,
            sponsor: msg.sender,
            sponsorFid: sponsorFid,
            sponsorName: sponsorName,
            sponsorLogoIPFS: sponsorLogoIPFS,
            city: city,
            country: country,
            latitude: latitude,
            longitude: longitude,
            eventDate: eventDate,
            checkInStart: eventDate - 1 hours,
            checkInEnd: eventDate + 6 hours,
            maxAttendees: maxAttendees,
            checkedInCount: 0,
            stampImageIPFS: "",
            isOpenEvent: isOpenEvent
        });

        emit EventCreated(eventId, msg.sender, name, city);
        return eventId;
    }

    function setStampImage(uint256 eventId, string memory ipfsHash) external {
        Event storage evt = events[eventId];
        require(evt.eventId != 0, "Not found");
        require(msg.sender == evt.sponsor || msg.sender == owner(), "Unauthorized");
        evt.stampImageIPFS = ipfsHash;
    }

    // ============================================
    // Invite/RSVP System
    // ============================================

    function inviteUsers(uint256 eventId, address[] calldata users) external {
        Event storage evt = events[eventId];
        require(evt.eventId != 0, "Not found");
        require(msg.sender == evt.sponsor || trustedOracles[msg.sender], "Unauthorized");

        for (uint256 i = 0; i < users.length; i++) {
            if (!eventInvited[eventId][users[i]]) {
                eventInvited[eventId][users[i]] = true;
                emit InviteSent(eventId, users[i]);
            }
        }
    }

    function acceptInvite(uint256 eventId) external {
        Event storage evt = events[eventId];
        require(evt.eventId != 0, "Not found");
        require(evt.status == EventStatus.Active, "Not active");
        require(block.timestamp < evt.eventDate, "Already started");

        if (!evt.isOpenEvent) {
            require(eventInvited[eventId][msg.sender], "Not invited");
        }

        require(!eventRSVP[eventId][msg.sender], "Already RSVP'd");

        eventRSVP[eventId][msg.sender] = true;
        rsvpList[eventId].push(msg.sender);

        emit RSVPAccepted(eventId, msg.sender);
    }

    function canCheckIn(uint256 eventId, address user) public view returns (bool) {
        Event storage evt = events[eventId];
        if (evt.eventId == 0 || evt.status != EventStatus.Active) return false;
        if (evt.isOpenEvent) return true;
        return eventRSVP[eventId][user];
    }

    // ============================================
    // Check-in with GPS
    // ============================================

    function checkInWithGPS(
        uint256 eventId,
        uint256 userFid,
        int256 latitude,
        int256 longitude
    ) external nonReentrant {
        Event storage evt = events[eventId];
        require(evt.eventId != 0, "Not found");
        require(evt.status == EventStatus.Active, "Not active");
        require(block.timestamp >= evt.checkInStart, "Not open");
        require(block.timestamp <= evt.checkInEnd, "Closed");
        require(evt.checkedInCount < evt.maxAttendees, "Full");
        require(attendees[eventId][msg.sender].checkInTime == 0, "Already checked in");
        require(canCheckIn(eventId, msg.sender), "Must RSVP first");

        bool gpsVerified = _verifyGPS(evt.latitude, evt.longitude, latitude, longitude);

        attendees[eventId][msg.sender] = Attendee({
            userAddress: msg.sender,
            userFid: userFid,
            checkInTime: block.timestamp,
            gpsVerified: gpsVerified,
            stampTokenId: 0
        });

        attendeeList[eventId].push(msg.sender);
        evt.checkedInCount++;

        emit CheckedIn(eventId, msg.sender, gpsVerified);
    }

    // Oracle-assisted check-in
    function checkInFor(
        uint256 eventId,
        address user,
        uint256 userFid,
        bool gpsVerified
    ) external {
        require(trustedOracles[msg.sender], "Not oracle");

        Event storage evt = events[eventId];
        require(evt.eventId != 0 && evt.status == EventStatus.Active, "Invalid");
        require(attendees[eventId][user].checkInTime == 0, "Already in");

        attendees[eventId][user] = Attendee({
            userAddress: user,
            userFid: userFid,
            checkInTime: block.timestamp,
            gpsVerified: gpsVerified,
            stampTokenId: 0
        });

        attendeeList[eventId].push(user);
        evt.checkedInCount++;

        emit CheckedIn(eventId, user, gpsVerified);
    }

    // ============================================
    // Stamp NFT
    // ============================================

    function claimStamp(uint256 eventId) external nonReentrant {
        Attendee storage att = attendees[eventId][msg.sender];
        require(att.checkInTime > 0, "Not checked in");
        require(att.stampTokenId == 0, "Already claimed");

        Event storage evt = events[eventId];

        _stampIdCounter++;
        uint256 tokenId = _stampIdCounter;

        _safeMint(msg.sender, tokenId);

        string memory uri = bytes(evt.stampImageIPFS).length > 0
            ? string(abi.encodePacked("ipfs://", evt.stampImageIPFS))
            : "";
        if (bytes(uri).length > 0) {
            _setTokenURI(tokenId, uri);
        }

        att.stampTokenId = tokenId;
        userStamps[msg.sender].push(eventId);

        emit StampMinted(tokenId, eventId, msg.sender);
    }

    // Batch mint for oracle
    function batchMintStamps(uint256 eventId, address[] calldata users) external {
        require(trustedOracles[msg.sender], "Not oracle");

        Event storage evt = events[eventId];
        require(evt.eventId != 0, "Not found");

        for (uint256 i = 0; i < users.length; i++) {
            Attendee storage att = attendees[eventId][users[i]];
            if (att.checkInTime > 0 && att.stampTokenId == 0) {
                _stampIdCounter++;
                uint256 tokenId = _stampIdCounter;
                _safeMint(users[i], tokenId);
                att.stampTokenId = tokenId;
                userStamps[users[i]].push(eventId);
                emit StampMinted(tokenId, eventId, users[i]);
            }
        }
    }

    // ============================================
    // View Functions
    // ============================================

    function getEvent(uint256 eventId) external view returns (Event memory) {
        return events[eventId];
    }

    function getAttendeeList(uint256 eventId) external view returns (address[] memory) {
        return attendeeList[eventId];
    }

    function getRSVPList(uint256 eventId) external view returns (address[] memory) {
        return rsvpList[eventId];
    }

    function getUserStamps(address user) external view returns (uint256[] memory) {
        return userStamps[user];
    }

    function getAttendee(uint256 eventId, address user) external view returns (Attendee memory) {
        return attendees[eventId][user];
    }

    // ============================================
    // GPS Verification
    // ============================================

    function _verifyGPS(
        int256 eventLat,
        int256 eventLng,
        int256 userLat,
        int256 userLng
    ) internal pure returns (bool) {
        if (eventLat == 0 && eventLng == 0) return true; // No GPS required

        int256 latDiff = eventLat > userLat ? eventLat - userLat : userLat - eventLat;
        int256 lngDiff = eventLng > userLng ? eventLng - userLng : userLng - eventLng;

        // ~500m at equator (very rough approximation)
        // 1 degree ≈ 111km, so 0.0045 degrees ≈ 500m
        // With 1e6 precision: 4500 = 0.0045 * 1e6
        return latDiff <= 4500 && lngDiff <= 4500;
    }

    // ============================================
    // Admin
    // ============================================

    function addOracle(address oracle) external onlyOwner {
        trustedOracles[oracle] = true;
    }

    function removeOracle(address oracle) external onlyOwner {
        trustedOracles[oracle] = false;
    }

    function completeEvent(uint256 eventId) external {
        Event storage evt = events[eventId];
        require(msg.sender == evt.sponsor || msg.sender == owner(), "Unauthorized");
        evt.status = EventStatus.Completed;
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
