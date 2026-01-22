// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title PassportNFTV3
 * @notice EmpowerTours Passport - Streamlined for Monad Mainnet
 *
 * @dev V3 Changes from V2:
 * - ItineraryStampAdded event now emits city and country fields
 * - Enables Envio indexer to store stamp location data for passport SVG rendering
 *
 * V2 Changes from V1:
 * - Added authorizedMinters mapping for secure delegated minting via User Safes
 * - Added platformOperator role for registering User Safes
 * - Added DAO timelock support for future governance
 * - Added onlyAuthorizedMinter modifier to mintFor
 *
 * === FEATURES ===
 * - Farcaster ID (FID) integration for social features
 * - Delegation support (Platform Safe can mint for users)
 * - 150 WMON fixed minting price
 * - 24-hour cooldown between mints
 * - Automatic verification via oracle (Gemini Maps)
 * - Google Maps integration for stamps (placeId, coordinates)
 * - Simple credit scoring
 *
 * === VERIFICATION FLOW ===
 * 1. User mints passport (unverified)
 * 2. User submits GPS proof via IPFS
 * 3. Oracle validates via Gemini Maps API
 * 4. If valid, oracle calls verifyPassport()
 * 5. Verified passport gets 2x credit score multiplier
 *
 * === STAMP SYSTEM ===
 * - Venue Stamps: concerts, museums, events (+10 points, +5 if verified)
 * - Itinerary Stamps: completed travel itineraries (+15 points, +10 if GPS verified)
 * - All stamps include Google Maps placeId and coordinates
 */
contract PassportNFTV3 is ERC721, ERC721URIStorage, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============================================
    // Constants
    // ============================================
    uint256 public constant MINT_PRICE = 150 ether; // 150 WMON (~$5.25)
    uint256 public constant MINT_COOLDOWN = 24 hours;

    uint256 private _tokenIdCounter;
    IERC20 public wmonToken;

    // ============================================
    // V2: Authorization State
    // ============================================
    mapping(address => bool) public authorizedMinters;  // V2: For delegated minting via User Safes
    address public platformOperator;                     // V2: Can register User Safes as minters
    address public daoTimelock;                          // V2: DAO Timelock for governance

    // ============================================
    // Structs
    // ============================================

    struct PassportMetadata {
        uint256 userFid;            // Farcaster ID
        string countryCode;         // ISO country code (e.g., "US", "JP")
        string countryName;         // Full country name
        string region;              // State/province
        string continent;           // Continent
        uint256 mintedAt;           // Mint timestamp
        bool verified;              // Is location verified?
        string verificationProof;   // IPFS hash of verification proof
        uint256 verifiedAt;         // Verification timestamp
    }

    struct VenueStamp {
        string location;            // Venue name
        string eventType;           // Type of event (concert, museum, etc.)
        address artist;             // Artist/creator address (if applicable)
        uint256 timestamp;          // When stamp was added
        bool verified;              // Verified by oracle/Google Maps
        // Google Maps Integration
        string placeId;             // Google Maps placeId (e.g., "ChIJ...")
        string googleMapsUri;       // Google Maps URI
        int256 latitude;            // Latitude * 1e6 (for precision)
        int256 longitude;           // Longitude * 1e6
    }

    struct ItineraryStamp {
        uint256 itineraryId;        // Reference to itinerary NFT
        string locationName;        // Location name
        string city;                // City name
        string country;             // Country name
        uint256 stampedAt;          // Timestamp
        bool gpsVerified;           // GPS verified
        // Google Maps Integration
        string placeId;             // Google Maps placeId
        string googleMapsUri;       // Google Maps URI
        int256 latitude;            // Latitude * 1e6
        int256 longitude;           // Longitude * 1e6
    }

    // ============================================
    // Storage
    // ============================================
    mapping(uint256 => PassportMetadata) public passportData;
    mapping(address => mapping(string => uint256)) public userPassports; // user => countryCode => tokenId
    mapping(uint256 => mapping(string => uint256)) public fidPassports; // fid => countryCode => tokenId
    mapping(uint256 => VenueStamp[]) public passportStamps;
    mapping(uint256 => ItineraryStamp[]) public itineraryStamps;

    // Anti-spam tracking
    mapping(address => uint256) public lastMintTime;
    mapping(address => uint256) public totalMinted;

    // Trusted verifiers (can verify location proofs)
    mapping(address => bool) public trustedVerifiers;

    // Oracle address (for automated verification)
    address public oracle;
    address public platformWallet;

    // ============================================
    // Events
    // ============================================
    event PassportMinted(
        uint256 indexed tokenId,
        address indexed owner,
        uint256 indexed userFid,
        string countryCode,
        string countryName,
        string region,
        string continent,
        bool verified
    );
    event VerificationProofSubmitted(
        uint256 indexed tokenId,
        address indexed submitter,
        string proofIPFSHash,
        uint256 timestamp
    );
    event PassportVerified(
        uint256 indexed tokenId,
        address indexed verifier,
        string verificationProof,
        uint256 timestamp
    );
    event VenueStampAdded(
        uint256 indexed tokenId,
        string location,
        string placeId,
        bool verified,
        uint256 timestamp
    );
    event ItineraryStampAdded(
        uint256 indexed tokenId,
        uint256 indexed itineraryId,
        string locationName,
        string city,
        string country,
        string placeId,
        bool gpsVerified,
        uint256 timestamp
    );
    event VerifierAdded(address indexed verifier);
    event VerifierRemoved(address indexed verifier);
    event OracleUpdated(address indexed newOracle);

    // V2 Events
    event PlatformOperatorUpdated(address indexed operator);
    event UserSafeRegisteredAsMinter(address indexed userSafe);
    event AuthorizedMinterUpdated(address indexed minter, bool authorized);
    event DAOTimelockUpdated(address indexed oldTimelock, address indexed newTimelock);

    // ============================================
    // Modifiers
    // ============================================

    /**
     * @notice V2: Restricts minting to authorized minters (User Safes, Platform Safe, or owner)
     */
    modifier onlyAuthorizedMinter() {
        require(
            authorizedMinters[msg.sender] || msg.sender == owner(),
            "Not authorized to mint"
        );
        _;
    }

    modifier onlyOwnerOrDAO() {
        require(
            msg.sender == owner() || msg.sender == daoTimelock,
            "Only owner or DAO"
        );
        _;
    }

    // ============================================
    // Constructor
    // ============================================
    constructor(
        address _wmonToken,
        address _oracle,
        address _platformWallet
    )
        ERC721("EmpowerTours Passport V3", "ETPASS3")
        Ownable(msg.sender)
    {
        require(_wmonToken != address(0), "Invalid WMON");
        require(_oracle != address(0), "Invalid oracle");
        require(_platformWallet != address(0), "Invalid platform wallet");

        wmonToken = IERC20(_wmonToken);
        oracle = _oracle;
        platformWallet = _platformWallet;

        trustedVerifiers[msg.sender] = true; // Owner is default verifier
        trustedVerifiers[_oracle] = true;    // Oracle is verifier
    }

    // ============================================
    // Minting Functions (Delegation Support)
    // ============================================

    /**
     * @notice Mint passport (self) - requires caller to be authorized minter
     */
    function mint(
        uint256 userFid,
        string memory countryCode,
        string memory countryName,
        string memory region,
        string memory continent,
        string memory uri
    ) external onlyAuthorizedMinter returns (uint256) {
        return _mintPassport(msg.sender, userFid, countryCode, countryName, region, continent, uri);
    }

    /**
     * @notice Mint passport for another user (delegation support)
     * @dev V2: Only authorized minters (User Safes, Platform Safe, owner) can call
     * @param beneficiary The user who will own the passport
     * @param userFid Beneficiary's Farcaster ID
     * @param countryCode ISO country code
     * @param countryName Full country name
     * @param region State/province
     * @param continent Continent name
     * @param uri Token URI (IPFS or HTTP)
     */
    function mintFor(
        address beneficiary,
        uint256 userFid,
        string memory countryCode,
        string memory countryName,
        string memory region,
        string memory continent,
        string memory uri
    ) external onlyAuthorizedMinter nonReentrant returns (uint256) {
        return _mintPassport(beneficiary, userFid, countryCode, countryName, region, continent, uri);
    }

    /**
     * @notice Internal mint logic
     */
    function _mintPassport(
        address beneficiary,
        uint256 userFid,
        string memory countryCode,
        string memory countryName,
        string memory region,
        string memory continent,
        string memory uri
    ) internal returns (uint256) {
        require(beneficiary != address(0), "Invalid beneficiary");
        require(userFid > 0, "Invalid FID");
        require(userPassports[beneficiary][countryCode] == 0, "Already own passport for this country");
        require(fidPassports[userFid][countryCode] == 0, "FID already has passport for this country");

        // Anti-spam check
        (bool isOnCooldown, uint256 timeRemaining) = getCooldownStatus(beneficiary);
        require(!isOnCooldown, string(abi.encodePacked("Cooldown: ", _uint2str(timeRemaining), "s remaining")));

        // Transfer WMON from caller (supports delegation - Platform Safe pays)
        wmonToken.safeTransferFrom(msg.sender, platformWallet, MINT_PRICE);

        _tokenIdCounter++;
        uint256 tokenId = _tokenIdCounter;
        _safeMint(beneficiary, tokenId);
        _setTokenURI(tokenId, uri);

        passportData[tokenId] = PassportMetadata({
            userFid: userFid,
            countryCode: countryCode,
            countryName: countryName,
            region: region,
            continent: continent,
            mintedAt: block.timestamp,
            verified: false,
            verificationProof: "",
            verifiedAt: 0
        });

        userPassports[beneficiary][countryCode] = tokenId;
        fidPassports[userFid][countryCode] = tokenId;
        lastMintTime[beneficiary] = block.timestamp;
        totalMinted[beneficiary]++;

        emit PassportMinted(tokenId, beneficiary, userFid, countryCode, countryName, region, continent, false);
        return tokenId;
    }

    /**
     * @notice Check if user is on cooldown
     */
    function getCooldownStatus(address user) public view returns (bool isOnCooldown, uint256 timeRemaining) {
        uint256 nextMintTime = lastMintTime[user] + MINT_COOLDOWN;
        if (block.timestamp < nextMintTime) {
            return (true, nextMintTime - block.timestamp);
        }
        return (false, 0);
    }

    // ============================================
    // V2: Authorization Management
    // ============================================

    /**
     * @notice Set platform operator (can register User Safes)
     */
    function setPlatformOperator(address operator) external onlyOwner {
        platformOperator = operator;
        emit PlatformOperatorUpdated(operator);
    }

    /**
     * @notice Platform operator can register User Safes as authorized minters
     * @param userSafe The User Safe address to authorize
     */
    function registerUserSafeAsMinter(address userSafe) external {
        require(msg.sender == platformOperator, "Only platform operator");
        authorizedMinters[userSafe] = true;
        emit UserSafeRegisteredAsMinter(userSafe);
    }

    /**
     * @notice Owner can directly set authorized minter status
     */
    function setAuthorizedMinter(address minter, bool authorized) external onlyOwnerOrDAO {
        authorizedMinters[minter] = authorized;
        emit AuthorizedMinterUpdated(minter, authorized);
    }

    /**
     * @notice Set DAO timelock for future governance
     */
    function setDAOTimelock(address _daoTimelock) external onlyOwner {
        address oldTimelock = daoTimelock;
        daoTimelock = _daoTimelock;
        emit DAOTimelockUpdated(oldTimelock, _daoTimelock);
    }

    // ============================================
    // Verification System
    // ============================================

    /**
     * @notice User submits verification proof for review
     */
    function submitVerificationProof(uint256 tokenId, string memory proofIPFSHash) external {
        require(_ownerOf(tokenId) == msg.sender, "Not passport owner");
        require(!passportData[tokenId].verified, "Already verified");

        passportData[tokenId].verificationProof = proofIPFSHash;

        emit VerificationProofSubmitted(tokenId, msg.sender, proofIPFSHash, block.timestamp);
    }

    /**
     * @notice Verify passport (trusted verifiers/oracle only)
     */
    function verifyPassport(uint256 tokenId, string memory proofIPFSHash) external {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        require(trustedVerifiers[msg.sender] || msg.sender == owner(), "Not authorized");
        require(!passportData[tokenId].verified, "Already verified");

        passportData[tokenId].verified = true;
        if (bytes(proofIPFSHash).length > 0) {
            passportData[tokenId].verificationProof = proofIPFSHash;
        }
        passportData[tokenId].verifiedAt = block.timestamp;

        emit PassportVerified(tokenId, msg.sender, proofIPFSHash, block.timestamp);
    }

    /**
     * @notice Check if passport is verified
     */
    function isVerified(uint256 tokenId) external view returns (bool) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return passportData[tokenId].verified;
    }

    // ============================================
    // Stamps - Google Maps Integrated
    // ============================================

    /**
     * @notice Add venue stamp with Google Maps data
     */
    function addVenueStamp(
        uint256 tokenId,
        string memory location,
        string memory eventType,
        address artist,
        bool verified,
        string memory placeId,
        string memory googleMapsUri,
        int256 latitude,
        int256 longitude
    ) external {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        require(
            msg.sender == owner() ||
            msg.sender == oracle ||
            msg.sender == _ownerOf(tokenId),
            "Unauthorized"
        );

        passportStamps[tokenId].push(VenueStamp({
            location: location,
            eventType: eventType,
            artist: artist,
            timestamp: block.timestamp,
            verified: verified,
            placeId: placeId,
            googleMapsUri: googleMapsUri,
            latitude: latitude,
            longitude: longitude
        }));

        emit VenueStampAdded(tokenId, location, placeId, verified, block.timestamp);
    }

    /**
     * @notice Add itinerary stamp with Google Maps data
     */
    function addItineraryStamp(
        uint256 tokenId,
        uint256 itineraryId,
        string memory locationName,
        string memory city,
        string memory country,
        bool gpsVerified,
        string memory placeId,
        string memory googleMapsUri,
        int256 latitude,
        int256 longitude
    ) external {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        require(
            msg.sender == owner() ||
            msg.sender == oracle ||
            msg.sender == _ownerOf(tokenId),
            "Unauthorized"
        );

        itineraryStamps[tokenId].push(ItineraryStamp({
            itineraryId: itineraryId,
            locationName: locationName,
            city: city,
            country: country,
            stampedAt: block.timestamp,
            gpsVerified: gpsVerified,
            placeId: placeId,
            googleMapsUri: googleMapsUri,
            latitude: latitude,
            longitude: longitude
        }));

        emit ItineraryStampAdded(tokenId, itineraryId, locationName, city, country, placeId, gpsVerified, block.timestamp);
    }

    // ============================================
    // Credit Score System
    // ============================================

    /**
     * @notice Calculate credit score
     */
    function getCreditScore(uint256 tokenId) external view returns (uint256) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");

        uint256 venueStampBonus = passportStamps[tokenId].length * 10;
        uint256 itineraryStampBonus = itineraryStamps[tokenId].length * 15;

        uint256 verifiedBonus = 0;
        for (uint256 i = 0; i < passportStamps[tokenId].length; i++) {
            if (passportStamps[tokenId][i].verified) {
                verifiedBonus += 5;
            }
        }

        for (uint256 i = 0; i < itineraryStamps[tokenId].length; i++) {
            if (itineraryStamps[tokenId][i].gpsVerified) {
                verifiedBonus += 10;
            }
        }

        uint256 baseScore = 100 + venueStampBonus + itineraryStampBonus + verifiedBonus;

        // VERIFICATION BOOST: Verified passports get 2x multiplier on bonuses
        if (passportData[tokenId].verified) {
            uint256 bonuses = venueStampBonus + itineraryStampBonus + verifiedBonus;
            return 100 + (bonuses * 2);
        }

        return baseScore;
    }

    // ============================================
    // View Functions
    // ============================================

    function hasPassport(address user, string memory countryCode) public view returns (bool) {
        return userPassports[user][countryCode] != 0;
    }

    function hasPassportByFid(uint256 fid, string memory countryCode) public view returns (bool) {
        return fidPassports[fid][countryCode] != 0;
    }

    function getPassportByFid(uint256 fid, string memory countryCode) public view returns (uint256) {
        return fidPassports[fid][countryCode];
    }

    function getPassportData(uint256 tokenId) public view returns (PassportMetadata memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return passportData[tokenId];
    }

    function getPassportStamps(uint256 tokenId) external view returns (VenueStamp[] memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return passportStamps[tokenId];
    }

    function getItineraryStamps(uint256 tokenId) external view returns (ItineraryStamp[] memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return itineraryStamps[tokenId];
    }

    function getTotalStampCount(uint256 tokenId) external view returns (uint256) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return passportStamps[tokenId].length + itineraryStamps[tokenId].length;
    }

    function hasVisitedCity(uint256 tokenId, string memory city) external view returns (bool) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");

        ItineraryStamp[] memory stamps = itineraryStamps[tokenId];
        for (uint256 i = 0; i < stamps.length; i++) {
            if (keccak256(bytes(stamps[i].city)) == keccak256(bytes(city))) {
                return true;
            }
        }
        return false;
    }

    function getTotalSupply() external view returns (uint256) {
        return _tokenIdCounter;
    }

    function getUserMintCount(address user) external view returns (uint256) {
        return totalMinted[user];
    }

    // ============================================
    // Admin Functions
    // ============================================

    function addVerifier(address verifier) external onlyOwnerOrDAO {
        require(verifier != address(0), "Invalid address");
        trustedVerifiers[verifier] = true;
        emit VerifierAdded(verifier);
    }

    function removeVerifier(address verifier) external onlyOwnerOrDAO {
        trustedVerifiers[verifier] = false;
        emit VerifierRemoved(verifier);
    }

    function updateOracle(address newOracle) external onlyOwner {
        require(newOracle != address(0), "Invalid address");
        oracle = newOracle;
        trustedVerifiers[newOracle] = true;
        emit OracleUpdated(newOracle);
    }

    function updatePlatformWallet(address newWallet) external onlyOwner {
        require(newWallet != address(0), "Invalid address");
        platformWallet = newWallet;
    }

    function withdrawFunds() external onlyOwner {
        uint256 balance = wmonToken.balanceOf(address(this));
        require(balance > 0, "No funds to withdraw");
        wmonToken.safeTransfer(owner(), balance);
    }

    // ============================================
    // Internal Helpers
    // ============================================

    function _uint2str(uint256 _i) internal pure returns (string memory) {
        if (_i == 0) {
            return "0";
        }
        uint256 j = _i;
        uint256 len;
        while (j != 0) {
            len++;
            j /= 10;
        }
        bytes memory bstr = new bytes(len);
        uint256 k = len;
        while (_i != 0) {
            k = k-1;
            uint8 temp = (48 + uint8(_i - _i / 10 * 10));
            bytes1 b1 = bytes1(temp);
            bstr[k] = b1;
            _i /= 10;
        }
        return string(bstr);
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
