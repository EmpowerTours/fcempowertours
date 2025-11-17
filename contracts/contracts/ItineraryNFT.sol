// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ItineraryNFT
 * @notice Users discover local places, create travel experiences, sell guides, get passport stamps
 * @dev Integrates with PassportNFTv3 for stamping when users visit locations
 */
contract ItineraryNFT is ERC721URIStorage, Ownable, ReentrancyGuard {

    enum ExperienceType {
        FOOD,
        ATTRACTION,
        CULTURAL,
        NATURE,
        ENTERTAINMENT,
        ACCOMMODATION,
        SHOPPING,
        TRANSPORT,
        OTHER
    }

    struct LocalExperience {
        uint256 itineraryId;
        address creator;              // Who discovered it
        string country;               // Where is it
        string city;                  // Specific city
        string locationName;          // "El Taquero", "Machu Picchu", etc
        string description;           // Full guide
        ExperienceType experienceType;

        // Geolocation
        int256 latitude;              // Scaled by 1e6 for precision
        int256 longitude;             // Scaled by 1e6 for precision
        uint256 proximityRadius;      // Meters (e.g., 100m)

        // Pricing & sales
        uint256 price;                // In TOURS
        uint256 totalSold;            // How many people bought
        uint256 totalEarned;          // Total revenue

        // Verification
        bool isVerified;              // Admin/Community verified
        uint256 communityRating;      // 1-5 stars * 100 (500 = 5 stars)
        uint256 reviewCount;

        // Metadata
        string ipfsImageHash;         // Photo of location
        uint256 createdAt;
        bool active;
    }

    struct PassportStamp {
        uint256 passportTokenId;
        uint256 itineraryId;          // Which experience was visited
        uint256 stampedAt;            // When user checked in
        string locationName;
        string city;
        string country;
        bool verified;                // GPS verified or manual
    }

    mapping(uint256 => LocalExperience) public experiences;
    mapping(uint256 => PassportStamp[]) public passportStamps;  // passport -> stamps
    mapping(string => uint256[]) public cityExperiences;        // city -> itineraryIds
    mapping(string => uint256[]) public countryExperiences;     // country -> itineraryIds
    mapping(address => uint256[]) public creatorExperiences;    // creator -> itineraryIds
    mapping(address => mapping(uint256 => bool)) public hasPurchased; // user -> itineraryId -> purchased

    uint256 private _tokenIdCounter;
    address public passportContract;  // Link to PassportNFTv3
    IERC20 public toursToken;

    uint256 public constant CREATOR_SHARE = 80; // 80% to creator
    uint256 public constant PLATFORM_FEE = 20;  // 20% to platform
    uint256 public constant VISIT_BONUS = 5 ether; // 5 TOURS for visiting
    uint256 public constant CREATOR_BONUS = 2 ether; // 2 TOURS for creator when someone visits

    // Events
    event ExperienceCreated(
        uint256 indexed itineraryId,
        address indexed creator,
        string locationName,
        string city,
        string country,
        uint256 price
    );

    event ExperiencePurchased(
        uint256 indexed itineraryId,
        address indexed buyer,
        uint256 amount
    );

    event PassportStamped(
        uint256 indexed passportTokenId,
        uint256 indexed itineraryId,
        address indexed user,
        string locationName
    );

    event ExperienceVerified(
        uint256 indexed itineraryId,
        bool verified
    );

    constructor(address _passportContract, address _toursToken)
        ERC721("EmpowerTours Itinerary", "ITIN")
        Ownable(msg.sender)
    {
        passportContract = _passportContract;
        toursToken = IERC20(_toursToken);
    }

    /**
     * @dev Create new local experience (by traveler who discovered it)
     */
    function createExperience(
        string memory country,
        string memory city,
        string memory locationName,
        string memory description,
        ExperienceType experienceType,
        int256 latitude,
        int256 longitude,
        uint256 proximityRadius,  // in meters
        uint256 price,
        string memory ipfsImageHash
    ) external returns (uint256) {

        require(price > 0, "Price must be > 0");
        require(bytes(locationName).length > 0, "Location name required");
        require(latitude >= -90000000 && latitude <= 90000000, "Invalid latitude");
        require(longitude >= -180000000 && longitude <= 180000000, "Invalid longitude");

        uint256 itineraryId = _tokenIdCounter++;

        LocalExperience storage experience = experiences[itineraryId];
        experience.itineraryId = itineraryId;
        experience.creator = msg.sender;
        experience.country = country;
        experience.city = city;
        experience.locationName = locationName;
        experience.description = description;
        experience.experienceType = experienceType;
        experience.latitude = latitude;
        experience.longitude = longitude;
        experience.proximityRadius = proximityRadius;
        experience.price = price;
        experience.ipfsImageHash = ipfsImageHash;
        experience.createdAt = block.timestamp;
        experience.active = true;

        // Track by location
        cityExperiences[city].push(itineraryId);
        countryExperiences[country].push(itineraryId);
        creatorExperiences[msg.sender].push(itineraryId);

        // Mint NFT to creator
        _safeMint(msg.sender, itineraryId);
        _setTokenURI(itineraryId, ipfsImageHash);

        emit ExperienceCreated(itineraryId, msg.sender, locationName, city, country, price);

        return itineraryId;
    }

    /**
     * @dev Purchase access to experience guide
     */
    function purchaseExperience(uint256 itineraryId) external nonReentrant {
        LocalExperience storage experience = experiences[itineraryId];
        require(experience.active, "Experience not active");
        require(!hasPurchased[msg.sender][itineraryId], "Already purchased");

        uint256 price = experience.price;

        // Split: 80% to creator, 20% to platform
        uint256 creatorShare = (price * CREATOR_SHARE) / 100;
        uint256 platformShare = (price * PLATFORM_FEE) / 100;

        // Transfer TOURS
        require(
            toursToken.transferFrom(msg.sender, experience.creator, creatorShare),
            "Creator payment failed"
        );
        require(
            toursToken.transferFrom(msg.sender, owner(), platformShare),
            "Platform fee failed"
        );

        experience.totalSold++;
        experience.totalEarned += creatorShare;
        hasPurchased[msg.sender][itineraryId] = true;

        emit ExperiencePurchased(itineraryId, msg.sender, price);
    }

    /**
     * @dev User checks in at location (GPS + manual verification)
     * Creates a "stamp" on their passport
     */
    function stampPassportAtLocation(
        uint256 passportTokenId,
        uint256 itineraryId,
        int256 userLatitude,
        int256 userLongitude,
        bool manualVerification  // For testing, or if user wants to verify manually
    ) external nonReentrant {

        LocalExperience storage experience = experiences[itineraryId];
        require(experience.active, "Experience not active");

        // Verify GPS proximity (if not manual)
        bool proximityVerified = false;
        if (!manualVerification) {
            proximityVerified = isWithinProximity(
                experience.latitude,
                experience.longitude,
                userLatitude,
                userLongitude,
                experience.proximityRadius
            );
            require(proximityVerified, "Not close enough to location");
        }

        // Create stamp
        PassportStamp memory stamp = PassportStamp({
            passportTokenId: passportTokenId,
            itineraryId: itineraryId,
            stampedAt: block.timestamp,
            locationName: experience.locationName,
            city: experience.city,
            country: experience.country,
            verified: proximityVerified || manualVerification
        });

        passportStamps[passportTokenId].push(stamp);

        // Reward user for discovering (mint new TOURS)
        // Note: This assumes toursToken has a mint function accessible
        // If not, owner needs to pre-fund contract with TOURS
        _rewardUser(msg.sender, VISIT_BONUS);

        // Reward creator for their guide
        _rewardUser(experience.creator, CREATOR_BONUS);

        emit PassportStamped(passportTokenId, itineraryId, msg.sender, experience.locationName);
    }

    /**
     * @dev Internal function to reward users (can be overridden)
     */
    function _rewardUser(address user, uint256 amount) internal {
        // Transfer from contract balance (owner needs to fund contract)
        require(toursToken.transfer(user, amount), "Reward transfer failed");
    }

    /**
     * @dev Calculate distance between two GPS coordinates (simplified)
     * Returns true if within proximityRadius
     */
    function isWithinProximity(
        int256 lat1,
        int256 lon1,
        int256 lat2,
        int256 lon2,
        uint256 radiusMeters
    ) public pure returns (bool) {

        // Haversine approximation (simplified for gas efficiency)
        // Assumes 1 degree ≈ 111km

        int256 latDiff = lat1 > lat2 ? lat1 - lat2 : lat2 - lat1;
        int256 lonDiff = lon1 > lon2 ? lon1 - lon2 : lon2 - lon1;

        // 1 degree = 1e6 scaled units = 111km = 111000m
        // So radiusMeters in scaled units = radiusMeters * 1e6 / 111000
        uint256 allowedDiff = (radiusMeters * 1e6) / 111000;

        return uint256(latDiff) <= allowedDiff && uint256(lonDiff) <= allowedDiff;
    }

    /**
     * @dev Get passport stamps collection
     */
    function getPassportStamps(uint256 passportTokenId)
        external
        view
        returns (PassportStamp[] memory)
    {
        return passportStamps[passportTokenId];
    }

    /**
     * @dev Get experiences in a city
     */
    function getExperiencesByCity(string memory city)
        external
        view
        returns (uint256[] memory)
    {
        return cityExperiences[city];
    }

    /**
     * @dev Get experiences in a country
     */
    function getExperiencesByCountry(string memory country)
        external
        view
        returns (uint256[] memory)
    {
        return countryExperiences[country];
    }

    /**
     * @dev Get creator's experiences
     */
    function getCreatorExperiences(address creator)
        external
        view
        returns (uint256[] memory)
    {
        return creatorExperiences[creator];
    }

    /**
     * @dev Verify experience (admin/community)
     */
    function verifyExperience(uint256 itineraryId, bool verified)
        external
        onlyOwner
    {
        experiences[itineraryId].isVerified = verified;
        emit ExperienceVerified(itineraryId, verified);
    }

    /**
     * @dev Update experience (only by creator)
     */
    function updateExperience(
        uint256 itineraryId,
        string memory description,
        uint256 price,
        uint256 communityRating
    ) external {
        require(experiences[itineraryId].creator == msg.sender, "Not creator");

        experiences[itineraryId].description = description;
        experiences[itineraryId].price = price;
        experiences[itineraryId].communityRating = communityRating;
    }

    /**
     * @dev Get experience details
     */
    function getExperience(uint256 itineraryId)
        external
        view
        returns (LocalExperience memory)
    {
        return experiences[itineraryId];
    }

    /**
     * @dev Fund contract with TOURS for rewards
     */
    function fundRewards(uint256 amount) external {
        require(toursToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");
    }

    /**
     * @dev Withdraw TOURS (only owner)
     */
    function withdrawTours(uint256 amount) external onlyOwner {
        require(toursToken.transfer(owner(), amount), "Transfer failed");
    }

    /**
     * @dev Set passport contract address
     */
    function setPassportContract(address _passportContract) external onlyOwner {
        passportContract = _passportContract;
    }

    receive() external payable {}
}
