// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title SponsorWhitelist
 * @notice EmpowerTours Pioneer Sponsor Program
 *
 * === SPONSOR TIERS ===
 * PIONEER (Tier 0): First sponsor on testnet - La Mille
 *   - 1-of-1 Pioneer Badge NFT
 *   - 0% platform fees forever
 *   - DAO proposal rights (no TOURS threshold)
 *   - Whitelist for ALL future NFT drops
 *   - Featured placement in Event Oracle
 *
 * FOUNDING (Tier 1): First 10 sponsors
 *   - Founding Badge NFT
 *   - 2.5% platform fee (50% discount)
 *   - DAO proposal rights at 50 TOURS
 *
 * PARTNER (Tier 2): First 50 sponsors
 *   - Partner Badge NFT
 *   - 3.75% platform fee (25% discount)
 *
 * SUPPORTER (Tier 3): Open registration
 *   - 5% standard platform fee
 *
 * === TRAVEL STAMP DAO BOOST ===
 * Simple system: attend more events = more voting power
 * - 1-3 stamps: +10% voting power
 * - 4-7 stamps: +25% voting power
 * - 8-15 stamps: +50% voting power
 * - 16+ stamps: +100% voting power (2x)
 */
contract SponsorWhitelist is ERC721, ERC721URIStorage, Ownable, ReentrancyGuard {

    // ============================================
    // Enums & Constants
    // ============================================
    enum SponsorTier { Pioneer, Founding, Partner, Supporter }

    // Stamps are simple: 1 stamp per event attended
    // DAO voting boost increases with more stamps collected

    uint256 public constant PIONEER_SLOTS = 1;      // Only La Mille
    uint256 public constant FOUNDING_SLOTS = 10;
    uint256 public constant PARTNER_SLOTS = 50;

    uint256 public constant PIONEER_FEE_BPS = 0;       // 0% fee
    uint256 public constant FOUNDING_FEE_BPS = 250;    // 2.5% fee
    uint256 public constant PARTNER_FEE_BPS = 375;     // 3.75% fee
    uint256 public constant STANDARD_FEE_BPS = 500;    // 5% fee

    // ============================================
    // State Variables
    // ============================================
    uint256 private _badgeIdCounter;
    uint256 public pioneerCount;
    uint256 public foundingCount;
    uint256 public partnerCount;

    // Sponsor data
    struct Sponsor {
        uint256 badgeId;
        SponsorTier tier;
        string companyName;
        string logoIPFS;
        uint256 registeredAt;
        uint256 totalEventsSponsored;
        uint256 totalDeposited;
        bool daoProposalRights;
        uint256 daoThreshold;        // TOURS needed for proposal
        uint256 feeDiscountBps;      // Fee in basis points
        bool active;
    }

    // Travel Stamp tracking for DAO boost
    // Simple: more stamps = more voting power
    struct UserStampData {
        uint256 totalStamps;         // Total events attended
        uint256 lastUpdated;
    }

    // Mappings
    mapping(address => Sponsor) public sponsors;
    mapping(uint256 => address) public badgeToSponsor;
    mapping(address => UserStampData) public userStamps;
    mapping(address => bool) public whitelistedForDrops;
    mapping(address => uint256) public daoVotingBoost;  // Basis points boost

    // Pioneer sponsor (La Mille)
    address public pioneerSponsor;

    // Trusted contracts that can update stamp counts
    mapping(address => bool) public trustedStampSources;

    // ============================================
    // Events
    // ============================================
    event SponsorRegistered(
        address indexed sponsor,
        uint256 indexed badgeId,
        SponsorTier tier,
        string companyName
    );
    event SponsorUpgraded(address indexed sponsor, SponsorTier oldTier, SponsorTier newTier);
    event StampRecorded(address indexed user, uint256 indexed eventId, uint256 newTotal);
    event DAOBoostUpdated(address indexed user, uint256 newBoostBps);
    event WhitelistUpdated(address indexed user, bool whitelisted);
    event PioneerClaimed(address indexed sponsor, string companyName);

    // ============================================
    // Constructor
    // ============================================
    constructor()
        ERC721("EmpowerTours Sponsor Badge", "ETSPONSOR")
        Ownable(msg.sender)
    {}

    // ============================================
    // Pioneer Sponsor Registration (La Mille)
    // ============================================

    /**
     * @notice Register as Pioneer Sponsor (FIRST EVER - La Mille)
     * @dev Can only be called once, reserved for first testnet sponsor
     */
    function claimPioneerStatus(
        string memory companyName,
        string memory logoIPFS,
        string memory badgeURI
    ) external nonReentrant {
        require(pioneerCount == 0, "Pioneer slot already claimed");
        require(bytes(companyName).length > 0, "Company name required");

        pioneerCount = 1;
        pioneerSponsor = msg.sender;

        _badgeIdCounter++;
        uint256 badgeId = _badgeIdCounter;
        _safeMint(msg.sender, badgeId);
        _setTokenURI(badgeId, badgeURI);

        sponsors[msg.sender] = Sponsor({
            badgeId: badgeId,
            tier: SponsorTier.Pioneer,
            companyName: companyName,
            logoIPFS: logoIPFS,
            registeredAt: block.timestamp,
            totalEventsSponsored: 0,
            totalDeposited: 0,
            daoProposalRights: true,
            daoThreshold: 0,              // No TOURS needed for proposals!
            feeDiscountBps: PIONEER_FEE_BPS,
            active: true
        });

        badgeToSponsor[badgeId] = msg.sender;
        whitelistedForDrops[msg.sender] = true;

        emit PioneerClaimed(msg.sender, companyName);
        emit SponsorRegistered(msg.sender, badgeId, SponsorTier.Pioneer, companyName);
    }

    /**
     * @notice Register as Founding Sponsor (First 10)
     */
    function registerFoundingSponsor(
        string memory companyName,
        string memory logoIPFS,
        string memory badgeURI
    ) external nonReentrant {
        require(sponsors[msg.sender].badgeId == 0, "Already registered");
        require(foundingCount < FOUNDING_SLOTS, "Founding slots full");

        foundingCount++;

        _badgeIdCounter++;
        uint256 badgeId = _badgeIdCounter;
        _safeMint(msg.sender, badgeId);
        _setTokenURI(badgeId, badgeURI);

        sponsors[msg.sender] = Sponsor({
            badgeId: badgeId,
            tier: SponsorTier.Founding,
            companyName: companyName,
            logoIPFS: logoIPFS,
            registeredAt: block.timestamp,
            totalEventsSponsored: 0,
            totalDeposited: 0,
            daoProposalRights: true,
            daoThreshold: 50e18,          // 50 TOURS for proposals
            feeDiscountBps: FOUNDING_FEE_BPS,
            active: true
        });

        badgeToSponsor[badgeId] = msg.sender;
        whitelistedForDrops[msg.sender] = true;

        emit SponsorRegistered(msg.sender, badgeId, SponsorTier.Founding, companyName);
    }

    /**
     * @notice Register as Partner Sponsor (First 50)
     */
    function registerPartnerSponsor(
        string memory companyName,
        string memory logoIPFS,
        string memory badgeURI
    ) external nonReentrant {
        require(sponsors[msg.sender].badgeId == 0, "Already registered");
        require(partnerCount < PARTNER_SLOTS, "Partner slots full");

        partnerCount++;

        _badgeIdCounter++;
        uint256 badgeId = _badgeIdCounter;
        _safeMint(msg.sender, badgeId);
        _setTokenURI(badgeId, badgeURI);

        sponsors[msg.sender] = Sponsor({
            badgeId: badgeId,
            tier: SponsorTier.Partner,
            companyName: companyName,
            logoIPFS: logoIPFS,
            registeredAt: block.timestamp,
            totalEventsSponsored: 0,
            totalDeposited: 0,
            daoProposalRights: false,
            daoThreshold: 100e18,         // Standard 100 TOURS
            feeDiscountBps: PARTNER_FEE_BPS,
            active: true
        });

        badgeToSponsor[badgeId] = msg.sender;
        whitelistedForDrops[msg.sender] = true;

        emit SponsorRegistered(msg.sender, badgeId, SponsorTier.Partner, companyName);
    }

    // ============================================
    // Travel Stamp DAO Boost System
    // ============================================

    /**
     * @notice Record a Travel Stamp for a user (from EventSponsorshipAgreement)
     * @dev Only callable by trusted contracts
     * @param user The attendee receiving the stamp
     * @param eventId The event ID for reference
     */
    function recordStamp(
        address user,
        uint256 eventId
    ) external {
        require(trustedStampSources[msg.sender] || msg.sender == owner(), "Not authorized");

        UserStampData storage data = userStamps[user];
        data.totalStamps++;
        data.lastUpdated = block.timestamp;

        // Recalculate DAO voting boost
        _updateDAOBoost(user);

        emit StampRecorded(user, eventId, data.totalStamps);
    }

    /**
     * @notice Calculate and update DAO voting boost based on stamps
     *
     * Simple system: more events attended = more voting power
     * - 1-3 stamps: +10% voting power
     * - 4-7 stamps: +25% voting power
     * - 8-15 stamps: +50% voting power
     * - 16+ stamps: +100% voting power (2x)
     */
    function _updateDAOBoost(address user) internal {
        uint256 stamps = userStamps[user].totalStamps;

        uint256 boostBps;
        if (stamps >= 16) {
            boostBps = 10000; // +100%
        } else if (stamps >= 8) {
            boostBps = 5000;  // +50%
        } else if (stamps >= 4) {
            boostBps = 2500;  // +25%
        } else if (stamps >= 1) {
            boostBps = 1000;  // +10%
        } else {
            boostBps = 0;
        }

        daoVotingBoost[user] = boostBps;
        emit DAOBoostUpdated(user, boostBps);
    }

    /**
     * @notice Get effective voting power for a user
     * @dev Called by DAO contract to apply boost
     */
    function getEffectiveVotingPower(
        address user,
        uint256 baseVotes
    ) external view returns (uint256) {
        uint256 boostBps = daoVotingBoost[user];
        if (boostBps == 0) return baseVotes;

        // Apply boost: baseVotes * (1 + boostBps/10000)
        return baseVotes + (baseVotes * boostBps / 10000);
    }

    // ============================================
    // Whitelist Management
    // ============================================

    /**
     * @notice Check if address is whitelisted for NFT drops
     */
    function isWhitelisted(address user) external view returns (bool) {
        return whitelistedForDrops[user];
    }

    /**
     * @notice Add addresses to whitelist (Pioneer sponsor privilege)
     * @dev Pioneer can whitelist their event attendees
     */
    function addToWhitelist(address[] calldata users) external {
        require(
            msg.sender == pioneerSponsor ||
            sponsors[msg.sender].tier == SponsorTier.Founding ||
            msg.sender == owner(),
            "Not authorized"
        );

        for (uint256 i = 0; i < users.length; i++) {
            whitelistedForDrops[users[i]] = true;
            emit WhitelistUpdated(users[i], true);
        }
    }

    // ============================================
    // View Functions
    // ============================================

    function getSponsor(address addr) external view returns (Sponsor memory) {
        return sponsors[addr];
    }

    function getUserStamps(address user) external view returns (UserStampData memory) {
        return userStamps[user];
    }

    function getSponsorFee(address sponsor) external view returns (uint256) {
        if (sponsors[sponsor].badgeId == 0) {
            return STANDARD_FEE_BPS;
        }
        return sponsors[sponsor].feeDiscountBps;
    }

    function canCreateDAOProposal(address user, uint256 toursBalance) external view returns (bool) {
        Sponsor memory s = sponsors[user];
        if (s.badgeId == 0) {
            return toursBalance >= 100e18; // Standard threshold
        }
        return s.daoProposalRights || toursBalance >= s.daoThreshold;
    }

    function getAvailableSlots() external view returns (
        uint256 pioneerAvailable,
        uint256 foundingAvailable,
        uint256 partnerAvailable
    ) {
        return (
            PIONEER_SLOTS - pioneerCount,
            FOUNDING_SLOTS - foundingCount,
            PARTNER_SLOTS - partnerCount
        );
    }

    function isPioneer(address addr) external view returns (bool) {
        return addr == pioneerSponsor;
    }

    // ============================================
    // Admin Functions
    // ============================================

    function addTrustedStampSource(address source) external onlyOwner {
        trustedStampSources[source] = true;
    }

    function removeTrustedStampSource(address source) external onlyOwner {
        trustedStampSources[source] = false;
    }

    function updateSponsorStats(
        address sponsor,
        uint256 eventsSponsored,
        uint256 totalDeposited
    ) external {
        require(trustedStampSources[msg.sender] || msg.sender == owner(), "Not authorized");
        sponsors[sponsor].totalEventsSponsored = eventsSponsored;
        sponsors[sponsor].totalDeposited = totalDeposited;
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
