// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ActionBasedDemandSignal
 * @notice Enhanced DemandSignalEngine - Maintains all original functionality + adds automated action-based tracking
 * @dev Tracks demand through user actions (purchases, stakes, itineraries) AND manual signals
 */
contract ActionBasedDemandSignal is Ownable, ReentrancyGuard {

    // ========================================================================
    // ENUMS & ACTION TYPES (NEW)
    // ========================================================================

    enum ActionType {
        MANUAL_SIGNAL,       // User explicitly signals demand (original functionality)
        MUSIC_PURCHASE,      // User bought artist's music
        MUSIC_STAKE,         // User staked artist's music NFT
        ITINERARY_CREATED,   // User created itinerary mentioning artist/venue
        ITINERARY_PURCHASED, // User bought itinerary to artist's venue
        PASSPORT_STAMP       // User visited artist's venue (stamped passport)
    }

    // ========================================================================
    // STRUCTURES (ENHANCED - maintains original + adds action tracking)
    // ========================================================================

    struct DemandSignal {
        address user;
        string locationName;
        bytes32 locationHash;
        uint256 artistId;
        string eventType;
        uint256 timestamp;
        bool active;
        ActionType actionType;      // NEW: Track how signal was generated
        uint256 signalWeight;       // NEW: Weighted value based on action
    }

    struct LocationDemandSnapshot {
        string location;
        bytes32 locationHash;
        uint256 uniqueSignalers;
        uint256 totalSignals;
        uint256 topArtistId;
        uint256 yieldPoolSize;
        uint256 lastUpdated;
        uint256 weightedDemand;     // NEW: Total weighted demand score
        uint256 purchaseCount;      // NEW: Count of purchases
        uint256 stakeCount;         // NEW: Count of stakes
        uint256 visitCount;         // NEW: Count of visits
    }

    // NEW: Venue booking structure
    struct VenueBooking {
        uint256 bookingId;
        address venue;
        uint256 artistId;
        string location;
        string venueName;
        string eventDetails;
        uint256 proposedDate;
        uint256 artistFee;
        uint256 ticketPrice;
        uint256 expectedAttendees;
        bool artistAccepted;
        bool artistRejected;
        bool eventCompleted;
        uint256 createdAt;
    }

    // ========================================================================
    // STATE (ORIGINAL + ENHANCED)
    // ========================================================================

    // Original state variables
    mapping(address => DemandSignal[]) public userSignals;
    mapping(bytes32 => LocationDemandSnapshot) public locationSnapshots;
    mapping(bytes32 => bool) public locationExists;
    mapping(bytes32 => mapping(uint256 => uint256)) public artistDemandByLocation;
    mapping(bytes32 => address[]) public locationSignalers;
    mapping(bytes32 => mapping(address => bool)) public hasSignalForLocation;

    address public keeper;

    // NEW: Enhanced tracking
    mapping(address => bool) public authorizedContracts;  // Backend/bot wallets
    mapping(bytes32 => mapping(uint256 => uint256)) public artistWeightedDemand; // location => artistId => weighted score

    // NEW: Venue bookings
    mapping(uint256 => VenueBooking) public bookings;
    mapping(address => uint256[]) public venueBookings;
    mapping(uint256 => uint256[]) public artistBookings;  // artistId => bookingIds
    uint256 private _bookingIdCounter;

    // NEW: Configurable weights
    uint256 public MANUAL_WEIGHT = 5;
    uint256 public PURCHASE_WEIGHT = 10;
    uint256 public STAKE_WEIGHT = 50;
    uint256 public ITINERARY_WEIGHT = 25;
    uint256 public VISIT_WEIGHT = 100;
    uint256 public DEFAULT_DEMAND_THRESHOLD = 500;

    // ========================================================================
    // EVENTS (ORIGINAL + ENHANCED)
    // ========================================================================

    // Original events
    event DemandSignaled(
        address indexed user,
        string location,
        bytes32 locationHash,
        uint256 artistId,
        string eventType,
        uint256 timestamp
    );

    event LocationSnapshotUpdated(
        bytes32 indexed locationHash,
        string location,
        uint256 uniqueSignalers,
        uint256 yieldPoolSize,
        uint256 timestamp
    );

    event KeeperUpdated(address indexed newKeeper);

    // NEW: Enhanced events
    event ActionBasedSignalRecorded(
        address indexed user,
        string location,
        uint256 indexed artistId,
        ActionType actionType,
        uint256 signalWeight
    );

    event DemandThresholdMet(
        string location,
        uint256 indexed artistId,
        uint256 totalWeightedDemand
    );

    event VenueBookingCreated(
        uint256 indexed bookingId,
        address indexed venue,
        uint256 indexed artistId,
        string location,
        uint256 artistFee
    );

    event ArtistBookingResponse(
        uint256 indexed bookingId,
        uint256 indexed artistId,
        bool accepted
    );

    // ========================================================================
    // MODIFIERS
    // ========================================================================

    modifier onlyKeeper() {
        require(msg.sender == keeper || msg.sender == owner(), "Not keeper or owner");
        _;
    }

    modifier onlyAuthorized() {
        require(authorizedContracts[msg.sender] || msg.sender == owner(), "Not authorized");
        _;
    }

    // ========================================================================
    // CONSTRUCTOR
    // ========================================================================

    constructor(address _keeper) Ownable(msg.sender) {
        require(_keeper != address(0), "Invalid keeper");
        keeper = _keeper;
    }

    // ========================================================================
    // PUBLIC FUNCTIONS (ORIGINAL - kept for backwards compatibility)
    // ========================================================================

    /**
     * @dev Signal interest in event (FREE - no payment required) - ORIGINAL FUNCTION
     */
    function signalDemand(
        string memory location,
        uint256 artistId,
        string memory eventType
    ) external {
        _recordSignal(
            msg.sender,
            location,
            artistId,
            eventType,
            ActionType.MANUAL_SIGNAL
        );
    }

    /**
     * @dev Get all demand signals for a user - ORIGINAL FUNCTION
     */
    function getUserSignals(address user)
        external
        view
        returns (DemandSignal[] memory)
    {
        return userSignals[user];
    }

    /**
     * @dev Get demand snapshot for location - ORIGINAL FUNCTION
     */
    function getLocationDemand(string memory location)
        external
        view
        returns (LocationDemandSnapshot memory)
    {
        bytes32 locHash = keccak256(abi.encodePacked(location));
        return locationSnapshots[locHash];
    }

    /**
     * @dev Get unique signalers count for location - ORIGINAL FUNCTION
     */
    function getUniqueSignalersCount(string memory location)
        external
        view
        returns (uint256)
    {
        bytes32 locHash = keccak256(abi.encodePacked(location));
        return locationSignalers[locHash].length;
    }

    /**
     * @dev Get top artist demand for location - ORIGINAL FUNCTION
     */
    function getTopArtistForLocation(string memory location)
        external
        view
        returns (uint256 topArtistId)
    {
        bytes32 locHash = keccak256(abi.encodePacked(location));
        return locationSnapshots[locHash].topArtistId;
    }

    /**
     * @dev Get all signalers for a location - ORIGINAL FUNCTION
     */
    function getLocationSignalers(string memory location)
        external
        view
        returns (address[] memory)
    {
        bytes32 locHash = keccak256(abi.encodePacked(location));
        return locationSignalers[locHash];
    }

    // ========================================================================
    // NEW: ACTION-BASED DEMAND TRACKING (Called by frontend/bot)
    // ========================================================================

    /**
     * @dev Record demand signal from automated actions (called by authorized frontend/bot)
     */
    function recordActionBasedSignal(
        address user,
        string memory location,
        uint256 artistId,
        string memory eventType,
        ActionType actionType
    ) external onlyAuthorized {
        require(actionType != ActionType.MANUAL_SIGNAL, "Use signalDemand for manual signals");
        _recordSignal(user, location, artistId, eventType, actionType);
    }

    /**
     * @dev Internal function to record any signal (manual or action-based)
     */
    function _recordSignal(
        address user,
        string memory location,
        uint256 artistId,
        string memory eventType,
        ActionType actionType
    ) internal {
        require(bytes(location).length > 0, "Location required");
        require(bytes(eventType).length > 0, "Event type required");

        bytes32 locHash = keccak256(abi.encodePacked(location));

        // Calculate signal weight based on action type
        uint256 signalWeight = _getSignalWeight(actionType);

        // Record signal (enhanced with action tracking)
        DemandSignal memory signal = DemandSignal({
            user: user,
            locationName: location,
            locationHash: locHash,
            artistId: artistId,
            eventType: eventType,
            timestamp: block.timestamp,
            active: true,
            actionType: actionType,
            signalWeight: signalWeight
        });

        userSignals[user].push(signal);

        // Track unique signalers per location
        if (!hasSignalForLocation[locHash][user]) {
            locationSignalers[locHash].push(user);
            hasSignalForLocation[locHash][user] = true;
        }

        // Track artist demand (original)
        artistDemandByLocation[locHash][artistId]++;

        // Track weighted demand (NEW)
        artistWeightedDemand[locHash][artistId] += signalWeight;

        // Update snapshot metrics
        LocationDemandSnapshot storage snapshot = locationSnapshots[locHash];
        snapshot.weightedDemand += signalWeight;

        // Update action-specific counts
        if (actionType == ActionType.MUSIC_PURCHASE) snapshot.purchaseCount++;
        else if (actionType == ActionType.MUSIC_STAKE) snapshot.stakeCount++;
        else if (actionType == ActionType.PASSPORT_STAMP) snapshot.visitCount++;

        // Mark location as existing
        if (!locationExists[locHash]) {
            locationExists[locHash] = true;
            snapshot.location = location;
            snapshot.locationHash = locHash;
        }

        emit DemandSignaled(user, location, locHash, artistId, eventType, block.timestamp);
        emit ActionBasedSignalRecorded(user, location, artistId, actionType, signalWeight);

        // Check if threshold met
        if (artistWeightedDemand[locHash][artistId] >= DEFAULT_DEMAND_THRESHOLD) {
            emit DemandThresholdMet(location, artistId, artistWeightedDemand[locHash][artistId]);
        }
    }

    /**
     * @dev Get signal weight based on action type
     */
    function _getSignalWeight(ActionType actionType) internal view returns (uint256) {
        if (actionType == ActionType.MANUAL_SIGNAL) return MANUAL_WEIGHT;
        if (actionType == ActionType.MUSIC_PURCHASE) return PURCHASE_WEIGHT;
        if (actionType == ActionType.MUSIC_STAKE) return STAKE_WEIGHT;
        if (actionType == ActionType.ITINERARY_CREATED || actionType == ActionType.ITINERARY_PURCHASED) {
            return ITINERARY_WEIGHT;
        }
        if (actionType == ActionType.PASSPORT_STAMP) return VISIT_WEIGHT;
        return 0;
    }

    /**
     * @dev Get weighted demand for artist in location
     */
    function getArtistWeightedDemand(string memory location, uint256 artistId)
        external
        view
        returns (uint256)
    {
        bytes32 locHash = keccak256(abi.encodePacked(location));
        return artistWeightedDemand[locHash][artistId];
    }

    /**
     * @dev Check if demand threshold met for artist in location
     */
    function isDemandThresholdMet(string memory location, uint256 artistId)
        external
        view
        returns (bool)
    {
        bytes32 locHash = keccak256(abi.encodePacked(location));
        return artistWeightedDemand[locHash][artistId] >= DEFAULT_DEMAND_THRESHOLD;
    }

    // ========================================================================
    // NEW: VENUE BOOKING SYSTEM
    // ========================================================================

    /**
     * @dev Create venue booking (once demand threshold met)
     */
    function createVenueBooking(
        uint256 artistId,
        string memory location,
        string memory venueName,
        string memory eventDetails,
        uint256 proposedDate,
        uint256 artistFee,
        uint256 ticketPrice,
        uint256 expectedAttendees
    ) external nonReentrant returns (uint256) {
        bytes32 locHash = keccak256(abi.encodePacked(location));

        require(
            artistWeightedDemand[locHash][artistId] >= DEFAULT_DEMAND_THRESHOLD,
            "Demand threshold not met"
        );
        require(proposedDate > block.timestamp, "Date must be in future");
        require(artistFee > 0, "Artist fee must be > 0");

        uint256 bookingId = _bookingIdCounter++;

        VenueBooking storage booking = bookings[bookingId];
        booking.bookingId = bookingId;
        booking.venue = msg.sender;
        booking.artistId = artistId;
        booking.location = location;
        booking.venueName = venueName;
        booking.eventDetails = eventDetails;
        booking.proposedDate = proposedDate;
        booking.artistFee = artistFee;
        booking.ticketPrice = ticketPrice;
        booking.expectedAttendees = expectedAttendees;
        booking.createdAt = block.timestamp;

        venueBookings[msg.sender].push(bookingId);
        artistBookings[artistId].push(bookingId);

        emit VenueBookingCreated(bookingId, msg.sender, artistId, location, artistFee);

        return bookingId;
    }

    /**
     * @dev Artist responds to booking
     */
    function respondToBooking(uint256 bookingId, uint256 artistId, bool accept) external {
        VenueBooking storage booking = bookings[bookingId];
        require(booking.artistId == artistId, "Not the artist");
        require(!booking.artistAccepted && !booking.artistRejected, "Already responded");

        if (accept) {
            booking.artistAccepted = true;
        } else {
            booking.artistRejected = true;
        }

        emit ArtistBookingResponse(bookingId, artistId, accept);
    }

    /**
     * @dev Get venue's bookings
     */
    function getVenueBookings(address venue)
        external
        view
        returns (uint256[] memory)
    {
        return venueBookings[venue];
    }

    /**
     * @dev Get artist's bookings
     */
    function getArtistBookings(uint256 artistId)
        external
        view
        returns (uint256[] memory)
    {
        return artistBookings[artistId];
    }

    // ========================================================================
    // KEEPER FUNCTIONS (ORIGINAL + ENHANCED)
    // ========================================================================

    /**
     * @dev Update location snapshot with demand aggregation - ENHANCED
     */
    function updateLocationSnapshot(
        string memory location,
        uint256 yieldPoolSize,
        uint256 topArtistId
    ) external onlyKeeper {
        require(bytes(location).length > 0, "Location required");

        bytes32 locHash = keccak256(abi.encodePacked(location));
        uint256 uniqueCount = locationSignalers[locHash].length;

        LocationDemandSnapshot storage snapshot = locationSnapshots[locHash];
        snapshot.location = location;
        snapshot.locationHash = locHash;
        snapshot.uniqueSignalers = uniqueCount;
        snapshot.totalSignals = uniqueCount;
        snapshot.topArtistId = topArtistId;
        snapshot.yieldPoolSize = yieldPoolSize;
        snapshot.lastUpdated = block.timestamp;
        // weightedDemand, purchaseCount, stakeCount, visitCount are already tracked

        emit LocationSnapshotUpdated(locHash, location, uniqueCount, yieldPoolSize, block.timestamp);
    }

    /**
     * @dev Deactivate a demand signal - ORIGINAL FUNCTION
     */
    function deactivateSignal(address user, uint256 signalIndex) external onlyKeeper {
        require(signalIndex < userSignals[user].length, "Invalid signal index");
        userSignals[user][signalIndex].active = false;
    }

    // ========================================================================
    // ADMIN FUNCTIONS (ORIGINAL + NEW)
    // ========================================================================

    /**
     * @dev Update keeper address - ORIGINAL FUNCTION
     */
    function setKeeper(address newKeeper) external onlyOwner {
        require(newKeeper != address(0), "Invalid keeper");
        keeper = newKeeper;
        emit KeeperUpdated(newKeeper);
    }

    /**
     * @dev Authorize address to record action-based signals (backend/bot wallet) - NEW
     */
    function authorizeContract(address contractAddress, bool authorized) external onlyOwner {
        authorizedContracts[contractAddress] = authorized;
    }

    /**
     * @dev Update signal weights - NEW
     */
    function updateSignalWeights(
        uint256 manualWeight,
        uint256 purchaseWeight,
        uint256 stakeWeight,
        uint256 itineraryWeight,
        uint256 visitWeight
    ) external onlyOwner {
        MANUAL_WEIGHT = manualWeight;
        PURCHASE_WEIGHT = purchaseWeight;
        STAKE_WEIGHT = stakeWeight;
        ITINERARY_WEIGHT = itineraryWeight;
        VISIT_WEIGHT = visitWeight;
    }

    /**
     * @dev Update default demand threshold - NEW
     */
    function updateDemandThreshold(uint256 newThreshold) external onlyOwner {
        DEFAULT_DEMAND_THRESHOLD = newThreshold;
    }
}
