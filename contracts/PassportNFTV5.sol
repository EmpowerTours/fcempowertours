// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

/**
 * @title PassportNFTV4
 * @notice EmpowerTours Passport - Streamlined for Monad Mainnet
 *
 * @dev V4 changes from V3 (deployed, immutable, and left untouched):
 *
 *      **1. A Farcaster ID is no longer required to hold a passport.** V3's
 *      `require(userFid > 0)` shut wallet-only users out entirely, and the FID it demanded was
 *      never verified — anyone could pass any number.
 *
 *      **2. `fidPassports` is only touched when a FID exists.** It is keyed
 *      `fid => countryCode => tokenId`, so with a shared placeholder every wallet-only user
 *      would land on `fidPassports[0][code]`. The first would claim it and **every other
 *      wallet-only user in that country would be refused a passport** by a dedup rule aimed at
 *      somebody else. The address-keyed `userPassports` is the dedup that actually means
 *      something, and it was always there.
 *
 *      **3. Address-keyed siblings for the FID lookups.** `getPassportByFid` is live in
 *      `app/api/mirror-mate/register-guide/route.ts` and returns nothing for a wallet-only
 *      holder, so {getPassportByAddress} and {hasPassportByAddress} give callers a lookup that
 *      works for everyone. The FID views stay for compatibility.
 *
 *      **4. Self-minting is open.** V3 gated `mint` behind `onlyAuthorizedMinter`, which is a
 *      list of registered User Safes. A wallet-only visitor in an ordinary browser has no Safe
 *      on that list, so the FID fix alone would still have left them unable to mint. The gate
 *      bought nothing on this path in any case: `mint` takes the fee from `msg.sender` and
 *      gives the passport to `msg.sender`, so the only account it can spend from or mint to is
 *      the caller's own, and the per-address cooldown already bounds the rate. `mintFor` stays
 *      gated — that is the relayed path, where the payer and the recipient differ.
 *
 *      **5. {setTokenURI}** so a passport minted with a bad or missing URI can be repaired.
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
contract PassportNFTV5 is ERC721, ERC721URIStorage, Ownable, ReentrancyGuard, EIP712 {
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

    /// @dev Once true, {migrateLegacyPassport} is dead forever. See {sealPassportMigration}.
    bool public passportMigrationSealed;
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
        bool verified;              // True only when `attester` signed for it
        /// Who vouched for this stamp, proven on-chain. Zero means the holder
        /// recorded it themselves - an honest state, not a failure.
        address attester;
        // Google Maps Integration
        string placeId;             // Google Maps placeId (e.g., "ChIJ...")
        string googleMapsUri;       // Google Maps URI
        int256 latitude;            // Latitude * 1e6 (for precision)
        int256 longitude;           // Longitude * 1e6
    }

    // ============================================
    // Storage
    // ============================================
    mapping(uint256 => PassportMetadata) public passportData;
    mapping(address => mapping(string => uint256)) public userPassports; // user => countryCode => tokenId
    mapping(uint256 => mapping(string => uint256)) public fidPassports; // fid => countryCode => tokenId
    mapping(uint256 => VenueStamp[]) public passportStamps;

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
        ERC721("EmpowerTours Passport V5", "ETPASS5")
        Ownable(msg.sender)
        EIP712("EmpowerToursPassport", "1")
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
    ) external nonReentrant returns (uint256) {
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

        // The address is the identity, and this is the dedup that carries the meaning: one
        // passport per country per wallet, whether or not that wallet has a Farcaster account.
        require(userPassports[beneficiary][countryCode] == 0, "Already own passport for this country");

        // The FID check applies only to people who actually have a FID. Applied to 0 it would
        // let the first wallet-only holder of a country lock out every other one.
        //
        // Strictly this guard is redundant while the index write below is also guarded — with
        // nothing ever written to `fidPassports[0][code]`, an unguarded read here would find 0
        // and pass. Mutating this line alone does not fail any test, and that was checked rather
        // than assumed. It stays because the pair states one rule in both directions, and a
        // later edit that loosens the write should not silently re-arm the lockout.
        if (userFid != 0) {
            require(fidPassports[userFid][countryCode] == 0, "FID already has passport for this country");
        }

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
        // Never write index 0 — see the note on the mint gate above.
        if (userFid != 0) {
            fidPassports[userFid][countryCode] = tokenId;
        }
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

    // ============================================
    // Stamps - attested by signature, claimed by the holder
    // ============================================

    /**
     * An off-chain authorisation to place one stamp.
     *
     * `recipient` of address(0) is a BEARER grant: anyone holding the signature may
     * claim it. That is what makes ONE signature serve a whole show - the artist
     * signs once and every attendee submits the same grant, however many turn up.
     * It is also why a bearer grant needs a short window: the signature is public
     * the moment one person uses it, so `notAfter` is the only thing stopping it
     * being claimed forever.
     */
    struct StampGrant {
        address attester;
        address recipient;
        string label;
        string eventType;
        address subject;
        uint64 notBefore;
        uint64 notAfter;
        bytes32 nonce;
    }

    bytes32 private constant STAMP_GRANT_TYPEHASH = keccak256(
        "StampGrant(address attester,address recipient,string label,string eventType,address subject,uint64 notBefore,uint64 notAfter,bytes32 nonce)"
    );

    /// One claim per grant per passport, so a bearer grant serves many passports
    /// but cannot stamp the same one twice.
    mapping(bytes32 => mapping(uint256 => bool)) public grantClaimed;

    event StampClaimed(uint256 indexed tokenId, address indexed attester, bytes32 grantHash, string label);

    /**
     * @notice Claim a stamp authorised by an attester's signature. The CALLER pays.
     *
     * @dev This is the change V5 exists for. In V4, `addVenueStamp` took `verified`
     *      as a bool from whoever called it, and the holder was allowed to call it -
     *      so a self-award could wear an attested badge. Making attestation
     *      trustworthy meant letting only the oracle write, which put the platform
     *      on the hook for gas at every stamp: about 200 MON for a ten-thousand
     *      person show. Attestation and payment were welded together.
     *
     *      Here they are separate. The attester signs off-chain for nothing; the
     *      holder submits and pays. `attester` becomes a fact the contract proved
     *      rather than a claim the caller made.
     *
     *      There is deliberately no attester allowlist. A grant from a stranger puts
     *      a stamp on your own passport attested by a stranger - legible and
     *      worthless, exactly as it should be. An allowlist would add a permission
     *      system and an onboarding step to solve what the signature already solves:
     *      the contract proves who signed, the reader decides whether that matters.
     */
    function claimStamp(
        uint256 tokenId,
        StampGrant calldata grant,
        bytes calldata signature
    ) external nonReentrant {
        require(_ownerOf(tokenId) == msg.sender, "Not your passport");
        require(grant.attester != address(0), "No attester");
        require(block.timestamp >= grant.notBefore, "Too early");
        require(block.timestamp <= grant.notAfter, "Grant expired");
        require(
            grant.recipient == address(0) || grant.recipient == msg.sender,
            "Not the recipient"
        );

        bytes32 grantHash = keccak256(
            abi.encode(
                STAMP_GRANT_TYPEHASH,
                grant.attester,
                grant.recipient,
                keccak256(bytes(grant.label)),
                keccak256(bytes(grant.eventType)),
                grant.subject,
                grant.notBefore,
                grant.notAfter,
                grant.nonce
            )
        );
        require(!grantClaimed[grantHash][tokenId], "Already claimed");

        // ECDSA for EOAs, ERC-1271 for smart accounts. Every user holds a Safe, and
        // a Safe cannot produce an ECDSA signature over its own address.
        require(
            SignatureChecker.isValidSignatureNow(
                grant.attester, _hashTypedDataV4(grantHash), signature
            ),
            "Bad attestation"
        );

        grantClaimed[grantHash][tokenId] = true;

        passportStamps[tokenId].push(VenueStamp({
            location: grant.label,
            eventType: grant.eventType,
            artist: grant.subject,
            timestamp: block.timestamp,
            verified: true,
            attester: grant.attester,
            placeId: "",
            googleMapsUri: "",
            latitude: 0,
            longitude: 0
        }));

        emit StampClaimed(tokenId, grant.attester, grantHash, grant.label);
    }

    /**
     * @notice Record a stamp on your own passport with nobody vouching for it.
     * @dev `attester` is zero and `verified` is false - both FORCED here, not passed
     *      in. A fan should be able to log a show they went to; they should not be
     *      able to claim the artist signed for it.
     */
    function recordOwnStamp(
        uint256 tokenId,
        string calldata label,
        string calldata eventType,
        address subject
    ) external nonReentrant {
        require(_ownerOf(tokenId) == msg.sender, "Not your passport");

        passportStamps[tokenId].push(VenueStamp({
            location: label,
            eventType: eventType,
            artist: subject,
            timestamp: block.timestamp,
            verified: false,
            attester: address(0),
            placeId: "",
            googleMapsUri: "",
            latitude: 0,
            longitude: 0
        }));

        emit StampClaimed(tokenId, address(0), bytes32(0), label);
    }

    // ============================================
    // Credit Score System
    // ============================================

    /**
     * @notice Calculate credit score
     */
    function getCreditScore(uint256 tokenId) external view returns (uint256) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");

        // Itinerary stamps are gone, so their +15 and GPS bonus go with them. The
        // attested bonus keys on `attester` rather than `verified`: in V4 that bool
        // was passed by whoever wrote the stamp, so a self-award scored identically
        // to a real attestation.
        uint256 stampBonus = passportStamps[tokenId].length * 10;

        uint256 attestedBonus = 0;
        for (uint256 i = 0; i < passportStamps[tokenId].length; i++) {
            if (passportStamps[tokenId][i].attester != address(0)) {
                attestedBonus += 5;
            }
        }

        if (passportData[tokenId].verified) {
            return 100 + ((stampBonus + attestedBonus) * 2);
        }
        return 100 + stampBonus + attestedBonus;
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

    /**
     * @notice Look up a passport by holder address. Works for everyone.
     * @dev The sibling of {getPassportByFid}, which returns 0 for a wallet-only holder because
     *      they have no FID to be indexed under. Prefer this one in new code.
     */
    function getPassportByAddress(address user, string memory countryCode)
        public
        view
        returns (uint256)
    {
        return userPassports[user][countryCode];
    }

    function hasPassportByAddress(address user, string memory countryCode)
        public
        view
        returns (bool)
    {
        return userPassports[user][countryCode] != 0;
    }

    function getPassportData(uint256 tokenId) public view returns (PassportMetadata memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return passportData[tokenId];
    }

    function getPassportStamps(uint256 tokenId) external view returns (VenueStamp[] memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return passportStamps[tokenId];
    }
    function getTotalStampCount(uint256 tokenId) external view returns (uint256) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return passportStamps[tokenId].length;
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
    // Legacy migration
    // ============================================

    /**
     * @notice Re-issue a passport somebody already holds on PassportNFTV3.
     *
     * @dev V3 stays deployed and nothing moves across on its own, so repointing the app would
     *      make an existing holder's passports vanish from it. This re-issues them.
     *
     *      **Preserves `mintedAt`.** That is the whole reason this exists rather than the owner
     *      simply calling {mintFor}: a passport records when somebody was somewhere, and a
     *      migration that silently restamps every date to today destroys the only fact the token
     *      carries. `mintFor` hardcodes `block.timestamp` and there is no setter.
     *
     *      Charges nothing — the holder already paid for this passport once — and skips the
     *      cooldown, which exists to rate-limit new mints rather than a contract move.
     *
     *      Still enforces one passport per country per address, so this cannot mint duplicates,
     *      and still guards the FID index against the shared-zero collision.
     *
     *      Owner-only and permanently closable by {sealPassportMigration}. It mints without
     *      payment, so it must not outlive the migration it exists for.
     */
    function migrateLegacyPassport(
        address to,
        uint256 userFid,
        string memory countryCode,
        string memory countryName,
        string memory region,
        string memory continent,
        string memory uri,
        uint256 originalMintedAt
    ) external onlyOwner nonReentrant returns (uint256) {
        require(!passportMigrationSealed, "Passport migration is sealed");
        require(to != address(0), "Invalid beneficiary");
        require(originalMintedAt > 0, "Invalid mintedAt");
        require(userPassports[to][countryCode] == 0, "Already own passport for this country");
        if (userFid != 0) {
            require(fidPassports[userFid][countryCode] == 0, "FID already has passport for this country");
        }

        _tokenIdCounter++;
        uint256 tokenId = _tokenIdCounter;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);

        passportData[tokenId] = PassportMetadata({
            userFid: userFid,
            countryCode: countryCode,
            countryName: countryName,
            region: region,
            continent: continent,
            mintedAt: originalMintedAt,
            verified: false,
            verificationProof: "",
            verifiedAt: 0
        });

        userPassports[to][countryCode] = tokenId;
        if (userFid != 0) {
            fidPassports[userFid][countryCode] = tokenId;
        }
        totalMinted[to]++;

        emit PassportMinted(tokenId, to, userFid, countryCode, countryName, region, continent, false);
        return tokenId;
    }

    /**
     * @notice Close {migrateLegacyPassport} permanently.
     * @dev One way, on purpose — it is a free-mint path, and a toggle would leave one that an
     *      attacker holding the owner key could reopen.
     */
    function sealPassportMigration() external onlyOwner {
        passportMigrationSealed = true;
    }

    // ============================================
    // Admin
    // ============================================

    /// @notice Repair a passport minted with a missing or wrong tokenURI.
    function setTokenURI(uint256 tokenId, string memory uri) external onlyOwner {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        _setTokenURI(tokenId, uri);
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
