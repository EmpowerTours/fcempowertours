// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title EmpowerTweaks
 * @notice Decentralized Jailbreak Tweak Marketplace on Monad
 * @dev NFT-based ownership for iOS jailbreak tweaks with IPFS storage
 *
 * WHAT IS EMPOWERTWEAKS?
 * =====================
 * EmpowerTweaks is a Web3-native alternative to Cydia/Sileo - the traditional
 * jailbreak package managers. Instead of centralized servers that can go down,
 * tweaks are stored on IPFS and ownership is tracked via NFTs on Monad.
 *
 * HOW IT WORKS:
 * 1. Developer uploads .deb tweak file to IPFS
 * 2. Developer mints a TweakNFT with metadata (name, description, iOS compatibility)
 * 3. Users browse tweaks on the marketplace
 * 4. Users purchase tweaks with TOURS or MON tokens
 * 5. Purchase grants download access + license NFT
 * 6. Developer receives instant payment (minus platform fee)
 *
 * KEY FEATURES:
 * - Decentralized storage (IPFS) - tweaks can't be taken down
 * - True ownership - you own an NFT, not just a license
 * - Resale allowed - sell your tweak license to others
 * - Instant payouts - developers paid immediately
 * - On-chain reviews - ratings can't be censored
 * - Version updates - developers can push updates
 */

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract EmpowerTweaks is ERC721, ERC721URIStorage, Ownable, ReentrancyGuard {

    // ============ STRUCTS ============

    struct Tweak {
        uint256 id;
        string name;
        string description;
        string ipfsHash;           // Points to .deb file on IPFS
        string metadataHash;       // Points to full metadata JSON on IPFS
        string iconHash;           // Cover/icon image on IPFS
        address developer;
        uint256 priceInTours;      // Price in TOURS tokens (18 decimals)
        uint256 priceInMon;        // Alternative price in MON
        string[] compatibleVersions; // e.g., ["18.0", "18.1", "18.2"]
        string category;           // "tweaks", "themes", "utilities", "apps"
        uint256 totalSales;
        uint256 totalRevenue;
        uint256 createdAt;
        uint256 updatedAt;
        bool isActive;
        bool isVerified;           // Verified by platform (security checked)
    }

    struct Review {
        address reviewer;
        uint256 tweakId;
        uint8 rating;              // 1-5 stars
        string comment;
        string ipfsHash;           // Optional detailed review on IPFS
        uint256 timestamp;
        uint256 helpfulVotes;
    }

    struct Purchase {
        uint256 tweakId;
        address buyer;
        uint256 pricePaid;
        address paymentToken;      // TOURS, MON, or address(0) for native
        uint256 timestamp;
        string version;            // Version at time of purchase
    }

    struct Version {
        string versionNumber;      // e.g., "1.0.0"
        string ipfsHash;           // New .deb file
        string changelog;
        uint256 timestamp;
    }

    // ============ STATE ============

    // Token contracts
    IERC20 public toursToken;
    IERC20 public wmonToken;

    // Counters
    uint256 public nextTweakId = 1;
    uint256 public nextReviewId = 1;
    uint256 public nextPurchaseId = 1;

    // Platform fee (basis points, 250 = 2.5%)
    uint256 public platformFeeBps = 250;
    address public feeRecipient;

    // Mappings
    mapping(uint256 => Tweak) public tweaks;
    mapping(uint256 => Review[]) public tweakReviews;
    mapping(uint256 => Version[]) public tweakVersions;
    mapping(uint256 => mapping(address => bool)) public hasPurchased;
    mapping(address => uint256[]) public developerTweaks;
    mapping(address => uint256[]) public userPurchases;
    mapping(uint256 => Purchase) public purchases;

    // Category tracking
    string[] public categories;
    mapping(string => uint256[]) public tweaksByCategory;

    // ============ EVENTS ============

    event TweakCreated(
        uint256 indexed tweakId,
        address indexed developer,
        string name,
        string ipfsHash,
        uint256 priceInTours
    );

    event TweakPurchased(
        uint256 indexed tweakId,
        address indexed buyer,
        address indexed developer,
        uint256 price,
        address paymentToken
    );

    event TweakUpdated(
        uint256 indexed tweakId,
        string newVersion,
        string newIpfsHash
    );

    event ReviewSubmitted(
        uint256 indexed tweakId,
        address indexed reviewer,
        uint8 rating,
        string comment
    );

    event TweakVerified(uint256 indexed tweakId, bool verified);

    // ============ CONSTRUCTOR ============

    constructor(
        address _toursToken,
        address _wmonToken,
        address _feeRecipient
    ) ERC721("EmpowerTweaks", "TWEAK") Ownable(msg.sender) {
        toursToken = IERC20(_toursToken);
        wmonToken = IERC20(_wmonToken);
        feeRecipient = _feeRecipient;

        // Initialize default categories
        categories.push("tweaks");
        categories.push("themes");
        categories.push("utilities");
        categories.push("apps");
        categories.push("widgets");
        categories.push("lockscreen");
        categories.push("statusbar");
        categories.push("keyboard");
    }

    // ============ DEVELOPER FUNCTIONS ============

    /**
     * @notice Create a new tweak listing
     * @param name Tweak name (e.g., "Snowboard")
     * @param description Short description
     * @param ipfsHash IPFS hash of the .deb package
     * @param metadataHash IPFS hash of full metadata JSON
     * @param iconHash IPFS hash of icon/cover image
     * @param priceInTours Price in TOURS tokens (18 decimals)
     * @param priceInMon Alternative price in MON
     * @param compatibleVersions Array of compatible iOS versions
     * @param category Category string
     */
    function createTweak(
        string memory name,
        string memory description,
        string memory ipfsHash,
        string memory metadataHash,
        string memory iconHash,
        uint256 priceInTours,
        uint256 priceInMon,
        string[] memory compatibleVersions,
        string memory category
    ) external returns (uint256) {
        require(bytes(name).length > 0, "Name required");
        require(bytes(ipfsHash).length > 0, "IPFS hash required");
        require(priceInTours > 0 || priceInMon > 0, "Price required");

        uint256 tweakId = nextTweakId++;

        tweaks[tweakId] = Tweak({
            id: tweakId,
            name: name,
            description: description,
            ipfsHash: ipfsHash,
            metadataHash: metadataHash,
            iconHash: iconHash,
            developer: msg.sender,
            priceInTours: priceInTours,
            priceInMon: priceInMon,
            compatibleVersions: compatibleVersions,
            category: category,
            totalSales: 0,
            totalRevenue: 0,
            createdAt: block.timestamp,
            updatedAt: block.timestamp,
            isActive: true,
            isVerified: false
        });

        // Track by developer and category
        developerTweaks[msg.sender].push(tweakId);
        tweaksByCategory[category].push(tweakId);

        // Add initial version
        tweakVersions[tweakId].push(Version({
            versionNumber: "1.0.0",
            ipfsHash: ipfsHash,
            changelog: "Initial release",
            timestamp: block.timestamp
        }));

        emit TweakCreated(tweakId, msg.sender, name, ipfsHash, priceInTours);

        return tweakId;
    }

    /**
     * @notice Push an update to an existing tweak
     */
    function updateTweak(
        uint256 tweakId,
        string memory newVersion,
        string memory newIpfsHash,
        string memory changelog,
        string[] memory newCompatibleVersions
    ) external {
        Tweak storage tweak = tweaks[tweakId];
        require(tweak.developer == msg.sender, "Not developer");
        require(tweak.isActive, "Tweak not active");

        tweak.ipfsHash = newIpfsHash;
        tweak.compatibleVersions = newCompatibleVersions;
        tweak.updatedAt = block.timestamp;

        tweakVersions[tweakId].push(Version({
            versionNumber: newVersion,
            ipfsHash: newIpfsHash,
            changelog: changelog,
            timestamp: block.timestamp
        }));

        emit TweakUpdated(tweakId, newVersion, newIpfsHash);
    }

    /**
     * @notice Update tweak price
     */
    function updatePrice(
        uint256 tweakId,
        uint256 newPriceInTours,
        uint256 newPriceInMon
    ) external {
        Tweak storage tweak = tweaks[tweakId];
        require(tweak.developer == msg.sender, "Not developer");

        tweak.priceInTours = newPriceInTours;
        tweak.priceInMon = newPriceInMon;
        tweak.updatedAt = block.timestamp;
    }

    /**
     * @notice Deactivate a tweak (soft delete)
     */
    function deactivateTweak(uint256 tweakId) external {
        Tweak storage tweak = tweaks[tweakId];
        require(tweak.developer == msg.sender || msg.sender == owner(), "Not authorized");
        tweak.isActive = false;
    }

    // ============ PURCHASE FUNCTIONS ============

    /**
     * @notice Purchase a tweak with TOURS tokens
     */
    function purchaseWithTours(uint256 tweakId) external nonReentrant {
        Tweak storage tweak = tweaks[tweakId];
        require(tweak.isActive, "Tweak not active");
        require(!hasPurchased[tweakId][msg.sender], "Already purchased");
        require(tweak.priceInTours > 0, "TOURS payment not available");

        uint256 price = tweak.priceInTours;
        uint256 fee = (price * platformFeeBps) / 10000;
        uint256 developerAmount = price - fee;

        // Transfer TOURS
        require(toursToken.transferFrom(msg.sender, tweak.developer, developerAmount), "Developer payment failed");
        if (fee > 0) {
            require(toursToken.transferFrom(msg.sender, feeRecipient, fee), "Fee payment failed");
        }

        _completePurchase(tweakId, msg.sender, price, address(toursToken));
    }

    /**
     * @notice Purchase a tweak with WMON tokens
     */
    function purchaseWithMon(uint256 tweakId) external nonReentrant {
        Tweak storage tweak = tweaks[tweakId];
        require(tweak.isActive, "Tweak not active");
        require(!hasPurchased[tweakId][msg.sender], "Already purchased");
        require(tweak.priceInMon > 0, "MON payment not available");

        uint256 price = tweak.priceInMon;
        uint256 fee = (price * platformFeeBps) / 10000;
        uint256 developerAmount = price - fee;

        // Transfer WMON
        require(wmonToken.transferFrom(msg.sender, tweak.developer, developerAmount), "Developer payment failed");
        if (fee > 0) {
            require(wmonToken.transferFrom(msg.sender, feeRecipient, fee), "Fee payment failed");
        }

        _completePurchase(tweakId, msg.sender, price, address(wmonToken));
    }

    /**
     * @notice Purchase with native MON (payable)
     */
    function purchaseWithNativeMon(uint256 tweakId) external payable nonReentrant {
        Tweak storage tweak = tweaks[tweakId];
        require(tweak.isActive, "Tweak not active");
        require(!hasPurchased[tweakId][msg.sender], "Already purchased");
        require(tweak.priceInMon > 0, "MON payment not available");
        require(msg.value >= tweak.priceInMon, "Insufficient payment");

        uint256 price = tweak.priceInMon;
        uint256 fee = (price * platformFeeBps) / 10000;
        uint256 developerAmount = price - fee;

        // Transfer native MON
        (bool devSuccess, ) = payable(tweak.developer).call{value: developerAmount}("");
        require(devSuccess, "Developer payment failed");

        if (fee > 0) {
            (bool feeSuccess, ) = payable(feeRecipient).call{value: fee}("");
            require(feeSuccess, "Fee payment failed");
        }

        // Refund excess
        if (msg.value > price) {
            (bool refundSuccess, ) = payable(msg.sender).call{value: msg.value - price}("");
            require(refundSuccess, "Refund failed");
        }

        _completePurchase(tweakId, msg.sender, price, address(0));
    }

    function _completePurchase(
        uint256 tweakId,
        address buyer,
        uint256 price,
        address paymentToken
    ) internal {
        Tweak storage tweak = tweaks[tweakId];

        // Mark as purchased
        hasPurchased[tweakId][buyer] = true;

        // Update stats
        tweak.totalSales++;
        tweak.totalRevenue += price;

        // Record purchase
        uint256 purchaseId = nextPurchaseId++;
        purchases[purchaseId] = Purchase({
            tweakId: tweakId,
            buyer: buyer,
            pricePaid: price,
            paymentToken: paymentToken,
            timestamp: block.timestamp,
            version: tweakVersions[tweakId][tweakVersions[tweakId].length - 1].versionNumber
        });
        userPurchases[buyer].push(purchaseId);

        // Mint license NFT
        _safeMint(buyer, purchaseId);
        _setTokenURI(purchaseId, tweak.metadataHash);

        emit TweakPurchased(tweakId, buyer, tweak.developer, price, paymentToken);
    }

    // ============ REVIEW FUNCTIONS ============

    /**
     * @notice Submit a review for a purchased tweak
     */
    function submitReview(
        uint256 tweakId,
        uint8 rating,
        string memory comment,
        string memory ipfsHash
    ) external {
        require(hasPurchased[tweakId][msg.sender], "Must purchase to review");
        require(rating >= 1 && rating <= 5, "Rating must be 1-5");

        // Check if already reviewed
        Review[] storage reviews = tweakReviews[tweakId];
        for (uint i = 0; i < reviews.length; i++) {
            require(reviews[i].reviewer != msg.sender, "Already reviewed");
        }

        reviews.push(Review({
            reviewer: msg.sender,
            tweakId: tweakId,
            rating: rating,
            comment: comment,
            ipfsHash: ipfsHash,
            timestamp: block.timestamp,
            helpfulVotes: 0
        }));

        emit ReviewSubmitted(tweakId, msg.sender, rating, comment);
    }

    /**
     * @notice Vote a review as helpful
     */
    function voteHelpful(uint256 tweakId, uint256 reviewIndex) external {
        require(reviewIndex < tweakReviews[tweakId].length, "Invalid review");
        tweakReviews[tweakId][reviewIndex].helpfulVotes++;
    }

    // ============ VIEW FUNCTIONS ============

    function getTweak(uint256 tweakId) external view returns (Tweak memory) {
        return tweaks[tweakId];
    }

    function getTweakReviews(uint256 tweakId) external view returns (Review[] memory) {
        return tweakReviews[tweakId];
    }

    function getTweakVersions(uint256 tweakId) external view returns (Version[] memory) {
        return tweakVersions[tweakId];
    }

    function getAverageRating(uint256 tweakId) external view returns (uint256) {
        Review[] storage reviews = tweakReviews[tweakId];
        if (reviews.length == 0) return 0;

        uint256 total = 0;
        for (uint i = 0; i < reviews.length; i++) {
            total += reviews[i].rating;
        }
        return (total * 100) / reviews.length; // Returns rating * 100 for precision
    }

    function getDeveloperTweaks(address developer) external view returns (uint256[] memory) {
        return developerTweaks[developer];
    }

    function getUserPurchases(address user) external view returns (uint256[] memory) {
        return userPurchases[user];
    }

    function getTweaksByCategory(string memory category) external view returns (uint256[] memory) {
        return tweaksByCategory[category];
    }

    function getCategories() external view returns (string[] memory) {
        return categories;
    }

    function getLatestVersion(uint256 tweakId) external view returns (Version memory) {
        Version[] storage versions = tweakVersions[tweakId];
        require(versions.length > 0, "No versions");
        return versions[versions.length - 1];
    }

    function canDownload(uint256 tweakId, address user) external view returns (bool) {
        return hasPurchased[tweakId][user] || tweaks[tweakId].developer == user;
    }

    // ============ ADMIN FUNCTIONS ============

    function verifyTweak(uint256 tweakId, bool verified) external onlyOwner {
        tweaks[tweakId].isVerified = verified;
        emit TweakVerified(tweakId, verified);
    }

    function setFee(uint256 newFeeBps) external onlyOwner {
        require(newFeeBps <= 1000, "Fee too high"); // Max 10%
        platformFeeBps = newFeeBps;
    }

    function setFeeRecipient(address newRecipient) external onlyOwner {
        feeRecipient = newRecipient;
    }

    function addCategory(string memory category) external onlyOwner {
        categories.push(category);
    }

    function setTokenAddresses(address _tours, address _wmon) external onlyOwner {
        toursToken = IERC20(_tours);
        wmonToken = IERC20(_wmon);
    }

    // ============ OVERRIDES ============

    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    // Allow contract to receive native MON
    receive() external payable {}
}
