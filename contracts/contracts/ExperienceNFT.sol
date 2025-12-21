// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ExperienceNFT
 * @notice GPS-revealed travel experiences with photo proof completion
 * @dev Users mint experiences (GPS hidden), visit location, upload proof, earn rewards
 *
 * KEY FEATURES:
 * - GPS coordinates HIDDEN until purchase
 * - Photo proof required for completion
 * - WMON payment (not TOURS)
 * - Transportation integration hooks
 * - Completion rewards
 */
contract ExperienceNFT is ERC721URIStorage, Ownable, ReentrancyGuard {

    enum ExperienceType {
        FOOD,
        ATTRACTION,
        CULTURAL,
        NATURE,
        ENTERTAINMENT,
        ACCOMMODATION,
        SHOPPING,
        ADVENTURE,
        OTHER
    }

    struct Experience {
        uint256 experienceId;
        address creator;

        // Public Info (visible to everyone)
        string title;
        string previewDescription;    // Short preview
        string country;
        string city;
        ExperienceType experienceType;
        uint256 price;                // In WMON
        uint256 completionReward;     // Reward for completing
        string previewImageHash;      // IPFS hash of preview image

        // Hidden Info (revealed after purchase)
        int256 latitude;              // × 1e6
        int256 longitude;             // × 1e6
        string locationName;          // Exact location name
        string fullDescription;       // Full guide with details
        uint256 proximityRadius;      // Meters required for check-in

        // Stats
        uint256 totalPurchased;
        uint256 totalCompleted;
        uint256 createdAt;
        bool active;
    }

    struct CompletionProof {
        uint256 experienceId;
        address user;
        int256 checkInLatitude;
        int256 checkInLongitude;
        string photoProofHash;        // IPFS hash of photo at location
        uint256 completedAt;
        bool verified;                // GPS verified
        bool rewardClaimed;
    }

    // Storage
    mapping(uint256 => Experience) public experiences;
    mapping(address => mapping(uint256 => bool)) public hasPurchased;
    mapping(address => mapping(uint256 => CompletionProof)) public completions;
    mapping(string => uint256[]) public cityExperiences;
    mapping(string => uint256[]) public countryExperiences;

    uint256 private _tokenIdCounter;
    IERC20 public wmonToken;

    // Revenue splits
    uint256 public constant CREATOR_SHARE = 80;  // 80% to creator
    uint256 public constant PLATFORM_FEE = 20;   // 20% to platform

    // Events
    event ExperienceCreated(
        uint256 indexed experienceId,
        address indexed creator,
        string title,
        string city,
        string country,
        uint256 price
    );

    event ExperiencePurchased(
        uint256 indexed experienceId,
        address indexed buyer,
        uint256 price
    );

    event ExperienceCompleted(
        uint256 indexed experienceId,
        address indexed user,
        string photoProofHash,
        uint256 rewardAmount
    );

    event TransportationRequested(
        uint256 indexed experienceId,
        address indexed user,
        int256 fromLat,
        int256 fromLon,
        int256 toLat,
        int256 toLon
    );

    constructor(address _wmonToken)
        ERC721("EmpowerTours Experience", "EXP")
        Ownable(msg.sender)
    {
        wmonToken = IERC20(_wmonToken);
    }

    /**
     * @dev Create new experience (by creator)
     * GPS and full description are stored but hidden until purchase
     */
    function createExperience(
        string memory title,
        string memory previewDescription,
        string memory country,
        string memory city,
        ExperienceType experienceType,
        uint256 price,
        uint256 completionReward,
        string memory previewImageHash,
        int256 latitude,
        int256 longitude,
        string memory locationName,
        string memory fullDescription,
        uint256 proximityRadius
    ) external returns (uint256) {
        require(price > 0, "Price must be > 0");
        require(bytes(title).length > 0, "Title required");
        require(latitude >= -90000000 && latitude <= 90000000, "Invalid latitude");
        require(longitude >= -180000000 && longitude <= 180000000, "Invalid longitude");
        require(proximityRadius > 0 && proximityRadius <= 1000, "Radius 1-1000m");

        uint256 experienceId = _tokenIdCounter++;

        Experience storage exp = experiences[experienceId];
        exp.experienceId = experienceId;
        exp.creator = msg.sender;
        exp.title = title;
        exp.previewDescription = previewDescription;
        exp.country = country;
        exp.city = city;
        exp.experienceType = experienceType;
        exp.price = price;
        exp.completionReward = completionReward;
        exp.previewImageHash = previewImageHash;
        exp.latitude = latitude;
        exp.longitude = longitude;
        exp.locationName = locationName;
        exp.fullDescription = fullDescription;
        exp.proximityRadius = proximityRadius;
        exp.createdAt = block.timestamp;
        exp.active = true;

        // Index by location
        cityExperiences[city].push(experienceId);
        countryExperiences[country].push(experienceId);

        // Mint NFT to creator
        _safeMint(msg.sender, experienceId);
        _setTokenURI(experienceId, previewImageHash);

        emit ExperienceCreated(experienceId, msg.sender, title, city, country, price);
        return experienceId;
    }

    /**
     * @dev Purchase experience - reveals GPS and full details
     */
    function purchaseExperience(uint256 experienceId) external nonReentrant {
        _purchaseExperienceFor(msg.sender, experienceId);
    }

    /**
     * @dev Purchase experience on behalf of user (beneficiary delegation)
     * @param beneficiary The user purchasing the experience
     * @param experienceId The experience to purchase
     */
    function purchaseExperienceFor(address beneficiary, uint256 experienceId) external nonReentrant {
        _purchaseExperienceFor(beneficiary, experienceId);
    }

    /**
     * @dev Internal function to purchase experience
     */
    function _purchaseExperienceFor(address beneficiary, uint256 experienceId) internal {
        Experience storage exp = experiences[experienceId];
        require(exp.active, "Experience not active");
        require(!hasPurchased[beneficiary][experienceId], "Already purchased");

        uint256 price = exp.price;
        uint256 creatorShare = (price * CREATOR_SHARE) / 100;
        uint256 platformShare = (price * PLATFORM_FEE) / 100;

        // Transfer WMON from beneficiary
        require(
            wmonToken.transferFrom(beneficiary, exp.creator, creatorShare),
            "Creator payment failed"
        );
        require(
            wmonToken.transferFrom(beneficiary, owner(), platformShare),
            "Platform fee failed"
        );

        hasPurchased[beneficiary][experienceId] = true;
        exp.totalPurchased++;

        emit ExperiencePurchased(experienceId, beneficiary, price);
    }

    /**
     * @dev Get experience details (public info only)
     */
    function getExperiencePreview(uint256 experienceId)
        external
        view
        returns (
            string memory title,
            string memory previewDescription,
            string memory country,
            string memory city,
            ExperienceType experienceType,
            uint256 price,
            uint256 completionReward,
            string memory previewImageHash,
            uint256 totalPurchased,
            uint256 totalCompleted,
            bool active
        )
    {
        Experience memory exp = experiences[experienceId];
        return (
            exp.title,
            exp.previewDescription,
            exp.country,
            exp.city,
            exp.experienceType,
            exp.price,
            exp.completionReward,
            exp.previewImageHash,
            exp.totalPurchased,
            exp.totalCompleted,
            exp.active
        );
    }

    /**
     * @dev Get GPS location (ONLY if purchased or creator)
     * This is the KEY feature - GPS is HIDDEN until you buy
     */
    function getExperienceLocation(uint256 experienceId)
        external
        view
        returns (
            int256 latitude,
            int256 longitude,
            string memory locationName,
            string memory fullDescription,
            uint256 proximityRadius
        )
    {
        Experience memory exp = experiences[experienceId];
        require(
            hasPurchased[msg.sender][experienceId] || exp.creator == msg.sender,
            "Must purchase to reveal location"
        );

        return (
            exp.latitude,
            exp.longitude,
            exp.locationName,
            exp.fullDescription,
            exp.proximityRadius
        );
    }

    /**
     * @dev Complete experience - check in with GPS + upload photo proof
     * User must be at location and provide photo
     */
    function completeExperience(
        uint256 experienceId,
        int256 userLatitude,
        int256 userLongitude,
        string memory photoProofHash
    ) external nonReentrant {
        _completeExperienceFor(msg.sender, experienceId, userLatitude, userLongitude, photoProofHash);
    }

    /**
     * @dev Complete experience on behalf of user (beneficiary delegation)
     * @param beneficiary The user completing the experience
     * @param experienceId The experience to complete
     * @param userLatitude User's GPS latitude
     * @param userLongitude User's GPS longitude
     * @param photoProofHash IPFS hash of photo proof
     */
    function completeExperienceFor(
        address beneficiary,
        uint256 experienceId,
        int256 userLatitude,
        int256 userLongitude,
        string memory photoProofHash
    ) external nonReentrant {
        _completeExperienceFor(beneficiary, experienceId, userLatitude, userLongitude, photoProofHash);
    }

    /**
     * @dev Internal function to complete experience
     */
    function _completeExperienceFor(
        address beneficiary,
        uint256 experienceId,
        int256 userLatitude,
        int256 userLongitude,
        string memory photoProofHash
    ) internal {
        Experience storage exp = experiences[experienceId];
        require(exp.active, "Experience not active");
        require(hasPurchased[beneficiary][experienceId], "Must purchase first");
        require(!completions[beneficiary][experienceId].rewardClaimed, "Already completed");
        require(bytes(photoProofHash).length > 0, "Photo proof required");

        // Verify GPS proximity
        bool withinProximity = isWithinProximity(
            exp.latitude,
            exp.longitude,
            userLatitude,
            userLongitude,
            exp.proximityRadius
        );
        require(withinProximity, "Not at location");

        // Create completion proof
        CompletionProof storage proof = completions[beneficiary][experienceId];
        proof.experienceId = experienceId;
        proof.user = beneficiary;
        proof.checkInLatitude = userLatitude;
        proof.checkInLongitude = userLongitude;
        proof.photoProofHash = photoProofHash;
        proof.completedAt = block.timestamp;
        proof.verified = true;
        proof.rewardClaimed = true;

        exp.totalCompleted++;

        // Award completion reward to beneficiary
        if (exp.completionReward > 0) {
            require(
                wmonToken.transfer(beneficiary, exp.completionReward),
                "Reward transfer failed"
            );
        }

        emit ExperienceCompleted(experienceId, beneficiary, photoProofHash, exp.completionReward);
    }

    /**
     * @dev Request transportation to experience location
     * Emits event that frontend can use to trigger ServiceMarketplace booking
     */
    function requestTransportation(
        uint256 experienceId,
        int256 pickupLatitude,
        int256 pickupLongitude
    ) external {
        Experience memory exp = experiences[experienceId];
        require(hasPurchased[msg.sender][experienceId], "Must purchase first");

        emit TransportationRequested(
            experienceId,
            msg.sender,
            pickupLatitude,
            pickupLongitude,
            exp.latitude,
            exp.longitude
        );
    }

    /**
     * @dev Calculate distance between two GPS coordinates
     * Simplified Haversine approximation for gas efficiency
     */
    function isWithinProximity(
        int256 lat1,
        int256 lon1,
        int256 lat2,
        int256 lon2,
        uint256 radiusMeters
    ) public pure returns (bool) {
        // Simplified distance check
        // 1 degree ≈ 111km = 111000m
        // Convert radius to degree units: radiusMeters * 1e6 / 111000

        int256 latDiff = lat1 > lat2 ? lat1 - lat2 : lat2 - lat1;
        int256 lonDiff = lon1 > lon2 ? lon1 - lon2 : lon2 - lon1;

        uint256 allowedDiff = (radiusMeters * 1e6) / 111000;

        return uint256(latDiff) <= allowedDiff && uint256(lonDiff) <= allowedDiff;
    }

    /**
     * @dev Get user's completion proof
     */
    function getCompletionProof(address user, uint256 experienceId)
        external
        view
        returns (CompletionProof memory)
    {
        return completions[user][experienceId];
    }

    /**
     * @dev Check if user has purchased experience
     */
    function hasUserPurchased(address user, uint256 experienceId)
        external
        view
        returns (bool)
    {
        return hasPurchased[user][experienceId];
    }

    /**
     * @dev Get experiences by city
     */
    function getExperiencesByCity(string memory city)
        external
        view
        returns (uint256[] memory)
    {
        return cityExperiences[city];
    }

    /**
     * @dev Get experiences by country
     */
    function getExperiencesByCountry(string memory country)
        external
        view
        returns (uint256[] memory)
    {
        return countryExperiences[country];
    }

    /**
     * @dev Fund contract with WMON for completion rewards
     */
    function fundRewards(uint256 amount) external {
        require(wmonToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");
    }

    /**
     * @dev Withdraw WMON (only owner)
     */
    function withdrawWMON(uint256 amount) external onlyOwner {
        require(wmonToken.transfer(owner(), amount), "Transfer failed");
    }

    /**
     * @dev Update experience (only creator)
     */
    function updateExperience(
        uint256 experienceId,
        string memory previewDescription,
        string memory fullDescription,
        uint256 price
    ) external {
        require(experiences[experienceId].creator == msg.sender, "Not creator");

        experiences[experienceId].previewDescription = previewDescription;
        experiences[experienceId].fullDescription = fullDescription;
        experiences[experienceId].price = price;
    }

    /**
     * @dev Toggle experience active status (creator or owner)
     */
    function toggleExperienceActive(uint256 experienceId) external {
        Experience storage exp = experiences[experienceId];
        require(
            exp.creator == msg.sender || owner() == msg.sender,
            "Not authorized"
        );
        exp.active = !exp.active;
    }

    receive() external payable {}
}
