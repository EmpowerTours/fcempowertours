// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/Base64.sol";

interface IToursRewardManager {
    enum RewardType {
        LISTEN,
        VOICE_NOTE,
        FIRST_LISTEN,
        STREAK_7,
        ITINERARY_COMPLETE,
        TOUR_GUIDE_COMPLETE,
        QUEST,
        ARTIST_MONTHLY,
        CLIMB_JOURNAL
    }

    function getCurrentReward(RewardType rewardType) external view returns (uint256);
    function distributeReward(address recipient, RewardType rewardType) external returns (uint256);
    function distributeRewardWithMultiplier(address recipient, RewardType rewardType, uint256 multiplierBps) external returns (uint256);
}

/**
 * @title ClimbingLocationsV2
 * @notice Rock climbing location sharing with dual NFT system
 * @author EmpowerTours
 *
 * @dev V2 Changes from V1:
 * - Replaced hardcoded keccak256 random 1-10 TOURS with ToursRewardManager
 * - Journal rewards use distributeRewardWithMultiplier for random 1-10x multiplier
 * - Contract no longer holds TOURS tokens (all TOURS in RewardManager)
 * - Added DAO timelock support
 * - Added setRewardManager for upgradability
 * - Random multiplier still uses keccak256 (acceptable for small rewards)
 *
 * Two NFT types in one contract:
 * - Access Badge NFTs (token IDs 1-999,999): Minted on purchase
 * - Climb Proof NFTs (token IDs 1,000,000+): Minted on journal submission
 */
contract ClimbingLocationsV2 is ERC721, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Strings for uint256;

    // ============ Constants ============

    IToursRewardManager public rewardManager;       // V2: Replaces toursToken
    IERC20 public immutable wmonToken;
    address public immutable platformSafe;

    uint256 public constant LOCATION_CREATION_COST = 35 ether; // 35 WMON
    uint256 public constant JOURNAL_COOLDOWN = 1 days;
    uint256 public constant PROOF_NFT_OFFSET = 1_000_000; // Proof NFTs start at 1M

    // ============ V2: Authorization ============

    address public daoTimelock;

    // ============ State Variables ============

    uint256 public nextLocationId = 1;
    uint256 public nextAccessBadgeId = 1;      // Token IDs 1-999,999
    uint256 public nextProofNFTId = 1;         // Actual counter (add PROOF_NFT_OFFSET for token ID)

    bool public journalingPaused = false;

    // ============ Structs ============

    struct ClimbLocation {
        uint256 id;
        address creator;
        uint256 creatorFid;           // 0 if Telegram user
        uint256 creatorTelegramId;    // 0 if Farcaster user
        string name;
        string difficulty;            // e.g., "V5", "5.12a"
        int256 latitude;              // Scaled by 1e6
        int256 longitude;             // Scaled by 1e6
        string photoProofIPFS;        // Initial rock photo
        string description;
        uint256 priceWmon;            // Cost to purchase in WMON
        uint256 createdAt;
        bool isActive;
    }

    struct AccessBadgeMetadata {
        uint256 locationId;
        address holder;
        uint256 purchasedAt;
    }

    struct ClimbProofMetadata {
        uint256 locationId;
        address climber;
        string photoIPFS;             // Climb photo with route drawn
        string entryText;
        uint256 reward;
        uint256 climbedAt;
    }

    // ============ Storage ============

    mapping(uint256 => ClimbLocation) public locations;
    mapping(uint256 => bool) public disabledLocations;

    // NFT metadata
    mapping(uint256 => AccessBadgeMetadata) public accessBadges;   // tokenId => metadata
    mapping(uint256 => ClimbProofMetadata) public climbProofs;     // tokenId => metadata

    // Access tracking
    mapping(uint256 => mapping(address => bool)) public hasPurchased;
    mapping(uint256 => mapping(address => uint256)) public userAccessBadge; // locationId => user => badgeTokenId

    // Journal rate limiting (GLOBAL 1 per day)
    mapping(address => uint256) public lastJournalTime;

    // Tracking
    mapping(address => uint256[]) public userPurchases;       // User's location IDs
    mapping(address => uint256[]) public userAccessBadges;    // User's Access Badge token IDs
    mapping(address => uint256[]) public userClimbProofs;     // User's Climb Proof token IDs

    // ============ Events ============

    event LocationCreated(
        uint256 indexed locationId,
        address indexed creator,
        uint256 creatorFid,
        uint256 creatorTelegramId,
        string name,
        string photoProofIPFS,
        uint256 priceWmon
    );

    event AccessBadgeMinted(
        uint256 indexed tokenId,
        uint256 indexed locationId,
        address indexed holder,
        uint256 holderFid,
        uint256 holderTelegramId
    );

    event ClimbProofMinted(
        uint256 indexed tokenId,
        uint256 indexed locationId,
        address indexed climber,
        string photoIPFS,
        uint256 reward
    );

    event LocationDisabled(uint256 indexed locationId);
    event JournalingPaused(bool paused);
    event EmergencyWithdrawal(address token, uint256 amount);

    // V2 Events
    event RewardManagerUpdated(address indexed oldManager, address indexed newManager);
    event DAOTimelockUpdated(address indexed oldTimelock, address indexed newTimelock);

    // ============ Modifiers ============

    modifier whenJournalingNotPaused() {
        require(!journalingPaused, "Journaling paused");
        _;
    }

    modifier locationExists(uint256 locationId) {
        require(locationId > 0 && locationId < nextLocationId, "Location doesn't exist");
        _;
    }

    modifier locationActive(uint256 locationId) {
        require(locations[locationId].isActive, "Location inactive");
        require(!disabledLocations[locationId], "Location disabled");
        _;
    }

    modifier onlyOwnerOrDAO() {
        require(msg.sender == owner() || msg.sender == daoTimelock, "Only owner or DAO");
        _;
    }

    // ============ Constructor ============

    constructor(
        address _rewardManager,
        address _wmonToken,
        address _platformSafe
    ) ERC721("EmpowerTours Climbing", "CLIMB") Ownable(msg.sender) {
        require(_rewardManager != address(0), "Invalid RewardManager");
        require(_wmonToken != address(0), "Invalid WMON token");
        require(_platformSafe != address(0), "Invalid platform safe");

        rewardManager = IToursRewardManager(_rewardManager);
        wmonToken = IERC20(_wmonToken);
        platformSafe = _platformSafe;
    }

    // ============ V2: Admin ============

    function setRewardManager(address _rewardManager) external onlyOwnerOrDAO {
        require(_rewardManager != address(0), "Invalid address");
        address old = address(rewardManager);
        rewardManager = IToursRewardManager(_rewardManager);
        emit RewardManagerUpdated(old, _rewardManager);
    }

    function setDAOTimelock(address _daoTimelock) external onlyOwner {
        address old = daoTimelock;
        daoTimelock = _daoTimelock;
        emit DAOTimelockUpdated(old, _daoTimelock);
    }

    // ============ Core Functions ============

    /**
     * @notice Create a new climbing location
     * @dev Costs 35 WMON (sent to platform safe)
     */
    function createLocation(
        uint256 creatorFid,
        uint256 creatorTelegramId,
        string calldata name,
        string calldata difficulty,
        int256 latitude,
        int256 longitude,
        string calldata photoProofIPFS,
        string calldata description,
        uint256 priceWmon
    ) external nonReentrant returns (uint256 locationId) {
        // Validation
        require(bytes(name).length > 0 && bytes(name).length <= 100, "Invalid name");
        require(bytes(photoProofIPFS).length > 0, "Photo required");
        require(latitude >= -90e6 && latitude <= 90e6, "Invalid latitude");
        require(longitude >= -180e6 && longitude <= 180e6, "Invalid longitude");
        require(creatorFid > 0 || creatorTelegramId > 0, "Must have user ID");
        require(priceWmon > 0, "Price must be > 0");

        // Transfer 35 WMON to platform safe
        wmonToken.safeTransferFrom(msg.sender, platformSafe, LOCATION_CREATION_COST);

        // Create location
        locationId = nextLocationId++;

        locations[locationId] = ClimbLocation({
            id: locationId,
            creator: msg.sender,
            creatorFid: creatorFid,
            creatorTelegramId: creatorTelegramId,
            name: name,
            difficulty: difficulty,
            latitude: latitude,
            longitude: longitude,
            photoProofIPFS: photoProofIPFS,
            description: description,
            priceWmon: priceWmon,
            createdAt: block.timestamp,
            isActive: true
        });

        emit LocationCreated(
            locationId,
            msg.sender,
            creatorFid,
            creatorTelegramId,
            name,
            photoProofIPFS,
            priceWmon
        );
    }

    /**
     * @notice Purchase access to a climbing location
     * @dev Pays creator in WMON, mints Access Badge NFT, cannot buy own location
     */
    function purchaseLocation(
        uint256 locationId,
        uint256 buyerFid,
        uint256 buyerTelegramId
    ) external nonReentrant locationExists(locationId) locationActive(locationId) returns (uint256 badgeTokenId) {
        ClimbLocation memory loc = locations[locationId];

        require(!hasPurchased[locationId][msg.sender], "Already purchased");
        require(loc.creator != msg.sender, "Cannot buy own location");
        require(buyerFid > 0 || buyerTelegramId > 0, "Must have user ID");
        require(nextAccessBadgeId < PROOF_NFT_OFFSET, "Access badge limit reached");

        // Transfer WMON from buyer to creator
        wmonToken.safeTransferFrom(msg.sender, loc.creator, loc.priceWmon);

        // Record purchase
        hasPurchased[locationId][msg.sender] = true;
        userPurchases[msg.sender].push(locationId);

        // Mint Access Badge NFT
        badgeTokenId = nextAccessBadgeId++;
        _safeMint(msg.sender, badgeTokenId);

        accessBadges[badgeTokenId] = AccessBadgeMetadata({
            locationId: locationId,
            holder: msg.sender,
            purchasedAt: block.timestamp
        });

        userAccessBadge[locationId][msg.sender] = badgeTokenId;
        userAccessBadges[msg.sender].push(badgeTokenId);

        emit AccessBadgeMinted(badgeTokenId, locationId, msg.sender, buyerFid, buyerTelegramId);

        return badgeTokenId;
    }

    /**
     * @notice Add journal entry with photo proof
     * @dev Requires purchase, enforces 1 journal per day GLOBALLY, mints Climb Proof NFT
     * @dev V2: Rewards distributed via ToursRewardManager with random 1-10x multiplier
     *      Uses keccak256 pseudo-random (acceptable for small reward variance).
     *      Base rate from CLIMB_JOURNAL type, multiplied by random 1-10x.
     */
    function addJournalEntry(
        uint256 locationId,
        uint256 authorFid,
        uint256 authorTelegramId,
        string calldata entryText,
        string calldata photoIPFS
    ) external nonReentrant whenJournalingNotPaused locationExists(locationId) locationActive(locationId) returns (uint256 proofTokenId) {
        require(hasPurchased[locationId][msg.sender], "Must purchase first");
        require(bytes(photoIPFS).length > 0, "Photo required");
        require(bytes(entryText).length > 0 && bytes(entryText).length <= 1000, "Invalid entry text");
        require(authorFid > 0 || authorTelegramId > 0, "Must have user ID");

        // CRITICAL: 1 journal per day TOTAL (not per location)
        require(
            block.timestamp - lastJournalTime[msg.sender] >= JOURNAL_COOLDOWN,
            "Wait 24h between journals"
        );

        // Update timestamp first (CEI pattern)
        lastJournalTime[msg.sender] = block.timestamp;

        // Random multiplier 1-10x using keccak256
        // multiplierBps: 10000 = 1x, 100000 = 10x
        uint256 randomFactor = 1 + (uint256(keccak256(abi.encodePacked(
            block.timestamp, msg.sender, locationId, nextProofNFTId
        ))) % 10);
        uint256 multiplierBps = randomFactor * 10000; // 10000-100000 (1x-10x)

        // Distribute reward via RewardManager
        uint256 reward = 0;
        try rewardManager.distributeRewardWithMultiplier(
            msg.sender,
            IToursRewardManager.RewardType.CLIMB_JOURNAL,
            multiplierBps
        ) returns (uint256 distributed) {
            reward = distributed;
        } catch {
            // Reward distribution failed (cap reached, paused, etc.)
            // Journal entry still succeeds, just no TOURS reward
        }

        // Mint Climb Proof NFT
        proofTokenId = PROOF_NFT_OFFSET + nextProofNFTId++;
        _safeMint(msg.sender, proofTokenId);

        climbProofs[proofTokenId] = ClimbProofMetadata({
            locationId: locationId,
            climber: msg.sender,
            photoIPFS: photoIPFS,
            entryText: entryText,
            reward: reward,
            climbedAt: block.timestamp
        });

        userClimbProofs[msg.sender].push(proofTokenId);

        emit ClimbProofMinted(proofTokenId, locationId, msg.sender, photoIPFS, reward);

        return proofTokenId;
    }

    // ============ NFT Metadata Functions ============

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);

        if (tokenId >= PROOF_NFT_OFFSET) {
            return _generateClimbProofURI(tokenId);
        } else {
            return _generateAccessBadgeURI(tokenId);
        }
    }

    function _generateAccessBadgeURI(uint256 tokenId) internal view returns (string memory) {
        AccessBadgeMetadata memory badge = accessBadges[tokenId];
        ClimbLocation memory loc = locations[badge.locationId];

        string memory json = string(
            abi.encodePacked(
                '{"name":"',
                loc.name,
                ' - Access Badge",',
                '"description":"Access to climb ',
                loc.name,
                ' (',
                loc.difficulty,
                ')",',
                '"image":"',
                _getLocationImageURL(loc.photoProofIPFS),
                '",',
                '"attributes":[',
                '{"trait_type":"Type","value":"Access Badge"},',
                '{"trait_type":"Location","value":"',
                loc.name,
                '"},',
                '{"trait_type":"Difficulty","value":"',
                loc.difficulty,
                '"},',
                '{"trait_type":"Purchased","display_type":"date","value":',
                badge.purchasedAt.toString(),
                '}',
                ']}'
            )
        );

        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(bytes(json))));
    }

    function _generateClimbProofURI(uint256 tokenId) internal view returns (string memory) {
        ClimbProofMetadata memory proof = climbProofs[tokenId];
        ClimbLocation memory loc = locations[proof.locationId];

        string memory json = string(
            abi.encodePacked(
                '{"name":"',
                loc.name,
                ' - Climb Proof",',
                '"description":"Proof of climbing ',
                loc.name,
                ' (',
                loc.difficulty,
                ') with route photo. Earned ',
                (proof.reward / 1 ether).toString(),
                ' TOURS.",',
                '"image":"',
                _getLocationImageURL(proof.photoIPFS),
                '",',
                '"attributes":[',
                '{"trait_type":"Type","value":"Climb Proof"},',
                '{"trait_type":"Location","value":"',
                loc.name,
                '"},',
                '{"trait_type":"Difficulty","value":"',
                loc.difficulty,
                '"},',
                '{"trait_type":"Reward","value":',
                (proof.reward / 1 ether).toString(),
                '},',
                '{"trait_type":"Climbed","display_type":"date","value":',
                proof.climbedAt.toString(),
                '}',
                ']}'
            )
        );

        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(bytes(json))));
    }

    function _getLocationImageURL(string memory ipfsHash) internal view returns (string memory) {
        if (bytes(ipfsHash).length > 7 &&
            bytes(ipfsHash)[0] == 'i' &&
            bytes(ipfsHash)[1] == 'p' &&
            bytes(ipfsHash)[2] == 'f' &&
            bytes(ipfsHash)[3] == 's') {
            string memory hash = _substring(ipfsHash, 7, bytes(ipfsHash).length);
            return string(abi.encodePacked("https://harlequin-used-hare-224.mypinata.cloud/ipfs/", hash));
        }
        return ipfsHash;
    }

    function _substring(string memory str, uint256 startIndex, uint256 endIndex) internal pure returns (string memory) {
        bytes memory strBytes = bytes(str);
        bytes memory result = new bytes(endIndex - startIndex);
        for (uint256 i = startIndex; i < endIndex; i++) {
            result[i - startIndex] = strBytes[i];
        }
        return string(result);
    }

    // ============ View Functions ============

    function getLocation(uint256 locationId) external view locationExists(locationId) returns (ClimbLocation memory) {
        return locations[locationId];
    }

    function getAccessBadge(uint256 tokenId) external view returns (AccessBadgeMetadata memory) {
        require(tokenId > 0 && tokenId < PROOF_NFT_OFFSET, "Invalid access badge ID");
        return accessBadges[tokenId];
    }

    function getClimbProof(uint256 tokenId) external view returns (ClimbProofMetadata memory) {
        require(tokenId >= PROOF_NFT_OFFSET, "Invalid climb proof ID");
        return climbProofs[tokenId];
    }

    function getUserPurchases(address user) external view returns (uint256[] memory) {
        return userPurchases[user];
    }

    function getUserAccessBadges(address user) external view returns (uint256[] memory) {
        return userAccessBadges[user];
    }

    function getUserClimbProofs(address user) external view returns (uint256[] memory) {
        return userClimbProofs[user];
    }

    /**
     * @notice Get current journal reward rate from RewardManager
     * @dev V2: Returns base rate (actual reward is 1-10x this)
     */
    function getCurrentJournalRewardBase() external view returns (uint256) {
        return rewardManager.getCurrentReward(IToursRewardManager.RewardType.CLIMB_JOURNAL);
    }

    function isAccessBadge(uint256 tokenId) public pure returns (bool) {
        return tokenId > 0 && tokenId < PROOF_NFT_OFFSET;
    }

    function isClimbProof(uint256 tokenId) public pure returns (bool) {
        return tokenId >= PROOF_NFT_OFFSET;
    }

    // ============ Admin Functions ============

    function disableLocation(uint256 locationId) external onlyOwner locationExists(locationId) {
        disabledLocations[locationId] = true;
        emit LocationDisabled(locationId);
    }

    function setJournalingPaused(bool _paused) external onlyOwnerOrDAO {
        journalingPaused = _paused;
        emit JournalingPaused(_paused);
    }

    /**
     * @notice Emergency withdraw any ERC20 tokens held by the contract
     * @dev V2: Contract should not normally hold TOURS (all in RewardManager)
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
        emit EmergencyWithdrawal(token, amount);
    }
}
