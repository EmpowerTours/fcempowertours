// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title ItineraryNFT
 * @notice User-Generated Travel Itineraries with Gemini Maps Integration
 *
 * === KEY FEATURES ===
 * - User-generated content (UGC): First visitor creates itinerary
 * - Creator attribution: Original creator earns 70% of all sales
 * - Google Maps integration: Every location has placeId + coordinates
 * - Delegation support: Platform Safe can purchase for users
 * - Photo proof required: Users must upload photos to create/complete itineraries
 * - Revenue sharing: 70% creator, 30% platform
 *
 * === CREATION FLOW ===
 * 1. User visits location (GPS-detected)
 * 2. User takes photo + adds review
 * 3. Oracle calls createItinerary() with Gemini Maps data
 * 4. User becomes creator, earns 70% of future sales
 *
 * === PURCHASE FLOW ===
 * 1. User discovers itinerary (from creator's profile or search)
 * 2. User purchases with WMON (70% to creator, 30% to platform)
 * 3. User completes locations and collects stamps
 * 4. User can add photos and reviews to each location
 */
contract ItineraryNFT is ERC721, ERC721URIStorage, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============================================
    // Constants
    // ============================================
    uint256 public constant CREATOR_PERCENTAGE = 70; // 70%
    uint256 public constant PLATFORM_PERCENTAGE = 30; // 30%

    uint256 private _tokenIdCounter;
    IERC20 public wmonToken;

    // ============================================
    // Structs
    // ============================================

    struct Location {
        string name;                // Location name
        string placeId;             // Google Maps place ID
        string googleMapsUri;       // Google Maps URI
        int256 latitude;            // Latitude * 1e6
        int256 longitude;           // Longitude * 1e6
        string description;         // Description
    }

    struct ItineraryData {
        uint256 creatorFid;         // Creator's Farcaster ID
        address creator;            // Creator address (first visitor)
        string title;               // Itinerary title
        string description;         // Description/review from creator
        string city;                // City
        string country;             // Country
        uint256 price;              // Price in WMON
        uint256 totalPurchases;     // Number of purchases
        uint256 totalCompletions;   // Number of completions
        uint256 createdAt;          // Creation timestamp
        bool active;                // Can be purchased
        string photoProofIPFS;      // Creator's photo proof (IPFS)
        uint256 averageRating;      // Average rating (out of 500 = 5.00 stars)
        uint256 ratingCount;        // Number of ratings
    }

    struct LocationCompletion {
        uint256 completedAt;        // Timestamp
        string photoProofIPFS;      // User's photo proof
        bool completed;             // Completion status
    }

    // ============================================
    // Storage
    // ============================================
    mapping(uint256 => ItineraryData) public itineraries;
    mapping(uint256 => Location[]) public itineraryLocations;
    mapping(uint256 => mapping(address => bool)) public userPurchased;

    // tokenId => user => locationIndex => completion
    mapping(uint256 => mapping(address => mapping(uint256 => LocationCompletion))) public completions;

    // tokenId => user => completed location count
    mapping(uint256 => mapping(address => uint256)) public userProgress;

    // creator => itinerary IDs
    mapping(address => uint256[]) public creatorItineraries;

    // FID => itinerary IDs
    mapping(uint256 => uint256[]) public fidItineraries;

    address public oracle;
    address public platformWallet;

    // ============================================
    // Events
    // ============================================
    event ItineraryCreated(
        uint256 indexed itineraryId,
        address indexed creator,
        uint256 indexed creatorFid,
        string title,
        uint256 price,
        string photoProof
    );

    event ItineraryPurchased(
        uint256 indexed itineraryId,
        address indexed buyer,
        uint256 indexed buyerFid,
        uint256 price,
        uint256 creatorEarnings
    );

    event LocationCompleted(
        uint256 indexed itineraryId,
        address indexed user,
        uint256 locationIndex,
        string placeId,
        string photoProof
    );

    event ItineraryCompleted(
        uint256 indexed itineraryId,
        address indexed user
    );

    event ItineraryRated(
        uint256 indexed itineraryId,
        address indexed user,
        uint256 rating
    );

    event LocationAdded(
        uint256 indexed itineraryId,
        uint256 locationIndex,
        string placeId
    );

    // ============================================
    // Constructor
    // ============================================
    constructor(
        address _wmonToken,
        address _oracle,
        address _platformWallet
    )
        ERC721("EmpowerTours Itinerary", "ETITIN")
        Ownable(msg.sender)
    {
        require(_wmonToken != address(0), "Invalid WMON");
        require(_oracle != address(0), "Invalid oracle");
        require(_platformWallet != address(0), "Invalid platform wallet");

        wmonToken = IERC20(_wmonToken);
        oracle = _oracle;
        platformWallet = _platformWallet;
    }

    // ============================================
    // Itinerary Creation (Oracle Only)
    // ============================================

    /**
     * @notice Create itinerary (oracle only)
     * @dev Called by oracle after user visits location and submits photo + review
     * @param creator Creator address (first visitor)
     * @param creatorFid Creator's Farcaster ID
     * @param title Itinerary title
     * @param description Creator's review/description
     * @param city City name
     * @param country Country name
     * @param price Price in WMON (e.g., 10 ether = 10 WMON)
     * @param photoProofIPFS IPFS hash of creator's photo proof
     * @param locations Array of locations (from Gemini Maps)
     */
    function createItinerary(
        address creator,
        uint256 creatorFid,
        string memory title,
        string memory description,
        string memory city,
        string memory country,
        uint256 price,
        string memory photoProofIPFS,
        Location[] memory locations
    ) external returns (uint256) {
        require(msg.sender == oracle || msg.sender == owner(), "Only oracle can create");
        require(creator != address(0), "Invalid creator");
        require(creatorFid > 0, "Invalid FID");
        require(locations.length > 0, "No locations");
        require(price > 0, "Invalid price");

        _tokenIdCounter++;
        uint256 itineraryId = _tokenIdCounter;

        itineraries[itineraryId] = ItineraryData({
            creatorFid: creatorFid,
            creator: creator,
            title: title,
            description: description,
            city: city,
            country: country,
            price: price,
            totalPurchases: 0,
            totalCompletions: 0,
            createdAt: block.timestamp,
            active: true,
            photoProofIPFS: photoProofIPFS,
            averageRating: 0,
            ratingCount: 0
        });

        // Add locations
        for (uint256 i = 0; i < locations.length; i++) {
            itineraryLocations[itineraryId].push(locations[i]);
            emit LocationAdded(itineraryId, i, locations[i].placeId);
        }

        creatorItineraries[creator].push(itineraryId);
        fidItineraries[creatorFid].push(itineraryId);

        // Creator automatically owns the itinerary (for showcasing)
        _safeMint(creator, itineraryId);
        _setTokenURI(itineraryId, string(abi.encodePacked("ipfs://", photoProofIPFS)));

        emit ItineraryCreated(itineraryId, creator, creatorFid, title, price, photoProofIPFS);
        return itineraryId;
    }

    /**
     * @notice Add location to existing itinerary (owner only)
     */
    function addLocation(
        uint256 itineraryId,
        string memory name,
        string memory placeId,
        string memory googleMapsUri,
        int256 latitude,
        int256 longitude,
        string memory description
    ) external {
        require(msg.sender == oracle || msg.sender == owner(), "Only oracle");
        require(itineraries[itineraryId].creator != address(0), "Itinerary doesn't exist");

        Location memory newLocation = Location({
            name: name,
            placeId: placeId,
            googleMapsUri: googleMapsUri,
            latitude: latitude,
            longitude: longitude,
            description: description
        });

        uint256 locationIndex = itineraryLocations[itineraryId].length;
        itineraryLocations[itineraryId].push(newLocation);

        emit LocationAdded(itineraryId, locationIndex, placeId);
    }

    // ============================================
    // Purchase Functions (Delegation Support)
    // ============================================

    /**
     * @notice Purchase itinerary (self)
     */
    function purchase(uint256 itineraryId, uint256 buyerFid) external {
        purchaseFor(msg.sender, buyerFid, itineraryId);
    }

    /**
     * @notice Purchase itinerary for another user (delegation support)
     * @param beneficiary The user who will own the itinerary
     * @param buyerFid Beneficiary's Farcaster ID
     * @param itineraryId Itinerary to purchase
     */
    function purchaseFor(
        address beneficiary,
        uint256 buyerFid,
        uint256 itineraryId
    ) public nonReentrant {
        require(beneficiary != address(0), "Invalid beneficiary");
        require(buyerFid > 0, "Invalid FID");

        ItineraryData storage itin = itineraries[itineraryId];
        require(itin.creator != address(0), "Itinerary doesn't exist");
        require(itin.active, "Itinerary not active");
        require(!userPurchased[itineraryId][beneficiary], "Already purchased");

        // Revenue split: 70% to creator, 30% to platform
        uint256 creatorShare = (itin.price * CREATOR_PERCENTAGE) / 100;
        uint256 platformShare = itin.price - creatorShare;

        // Transfer WMON from caller (Platform Safe) to creator and platform
        wmonToken.safeTransferFrom(msg.sender, itin.creator, creatorShare);
        wmonToken.safeTransferFrom(msg.sender, platformWallet, platformShare);

        userPurchased[itineraryId][beneficiary] = true;
        itin.totalPurchases++;

        emit ItineraryPurchased(itineraryId, beneficiary, buyerFid, itin.price, creatorShare);
    }

    // ============================================
    // Location Completion
    // ============================================

    /**
     * @notice Complete a location (oracle or user)
     * @param itineraryId Itinerary ID
     * @param user User completing the location
     * @param locationIndex Location index
     * @param photoProofIPFS IPFS hash of photo proof
     */
    function completeLocation(
        uint256 itineraryId,
        address user,
        uint256 locationIndex,
        string memory photoProofIPFS
    ) external {
        require(
            msg.sender == oracle ||
            msg.sender == owner() ||
            msg.sender == user,
            "Unauthorized"
        );
        require(userPurchased[itineraryId][user], "Haven't purchased itinerary");
        require(locationIndex < itineraryLocations[itineraryId].length, "Invalid location");
        require(!completions[itineraryId][user][locationIndex].completed, "Already completed");

        completions[itineraryId][user][locationIndex] = LocationCompletion({
            completedAt: block.timestamp,
            photoProofIPFS: photoProofIPFS,
            completed: true
        });

        userProgress[itineraryId][user]++;

        Location memory loc = itineraryLocations[itineraryId][locationIndex];
        emit LocationCompleted(itineraryId, user, locationIndex, loc.placeId, photoProofIPFS);

        // Check if all locations completed
        if (userProgress[itineraryId][user] == itineraryLocations[itineraryId].length) {
            itineraries[itineraryId].totalCompletions++;
            emit ItineraryCompleted(itineraryId, user);
        }
    }

    // ============================================
    // Rating System
    // ============================================

    /**
     * @notice Rate an itinerary (after completion)
     * @param itineraryId Itinerary ID
     * @param rating Rating (0-500, where 500 = 5.00 stars)
     */
    function rateItinerary(uint256 itineraryId, uint256 rating) external {
        require(rating <= 500, "Rating must be 0-500");
        require(userPurchased[itineraryId][msg.sender], "Haven't purchased");
        require(
            userProgress[itineraryId][msg.sender] == itineraryLocations[itineraryId].length,
            "Must complete all locations first"
        );

        ItineraryData storage itin = itineraries[itineraryId];

        // Calculate new average
        uint256 totalRating = (itin.averageRating * itin.ratingCount) + rating;
        itin.ratingCount++;
        itin.averageRating = totalRating / itin.ratingCount;

        emit ItineraryRated(itineraryId, msg.sender, rating);
    }

    // ============================================
    // View Functions
    // ============================================

    function getItinerary(uint256 itineraryId) external view returns (ItineraryData memory) {
        return itineraries[itineraryId];
    }

    function getLocations(uint256 itineraryId) external view returns (Location[] memory) {
        return itineraryLocations[itineraryId];
    }

    function getUserProgress(uint256 itineraryId, address user) external view returns (uint256, uint256) {
        uint256 completed = userProgress[itineraryId][user];
        uint256 total = itineraryLocations[itineraryId].length;
        return (completed, total);
    }

    function getLocationCompletion(
        uint256 itineraryId,
        address user,
        uint256 locationIndex
    ) external view returns (LocationCompletion memory) {
        return completions[itineraryId][user][locationIndex];
    }

    function getCreatorItineraries(address creator) external view returns (uint256[] memory) {
        return creatorItineraries[creator];
    }

    function getFidItineraries(uint256 fid) external view returns (uint256[] memory) {
        return fidItineraries[fid];
    }

    function hasPurchased(uint256 itineraryId, address user) external view returns (bool) {
        return userPurchased[itineraryId][user];
    }

    function getTotalSupply() external view returns (uint256) {
        return _tokenIdCounter;
    }

    // ============================================
    // Admin Functions
    // ============================================

    function toggleActive(uint256 itineraryId) external {
        require(
            msg.sender == owner() ||
            msg.sender == itineraries[itineraryId].creator,
            "Not authorized"
        );
        itineraries[itineraryId].active = !itineraries[itineraryId].active;
    }

    function updatePrice(uint256 itineraryId, uint256 newPrice) external {
        require(
            msg.sender == owner() ||
            msg.sender == itineraries[itineraryId].creator,
            "Not authorized"
        );
        require(newPrice > 0, "Invalid price");
        itineraries[itineraryId].price = newPrice;
    }

    function updateOracle(address newOracle) external onlyOwner {
        require(newOracle != address(0), "Invalid oracle");
        oracle = newOracle;
    }

    function updatePlatformWallet(address newWallet) external onlyOwner {
        require(newWallet != address(0), "Invalid wallet");
        platformWallet = newWallet;
    }

    function withdrawFunds() external onlyOwner {
        uint256 balance = wmonToken.balanceOf(address(this));
        require(balance > 0, "No funds");
        wmonToken.safeTransfer(owner(), balance);
    }

    // ============================================
    // Overrides
    // ============================================

    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
