// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IPassportNFT {
    function getPassportData(uint256 tokenId) external view returns (
        uint256 userFid,
        string memory countryCode,
        string memory countryName,
        string memory region,
        string memory continent,
        uint256 mintedAt,
        bool verified,
        string memory verificationProof,
        uint256 verifiedAt
    );
    function getCreditScore(uint256 tokenId) external view returns (uint256);
    function ownerOf(uint256 tokenId) external view returns (address);
}

/**
 * @title ResonanceLands
 * @notice Tokenized land leasing platform with ownership verification
 *
 * === REGISTRATION FLOW ===
 * 1. User submits land registration with deed/ownership documents (IPFS)
 * 2. Land is created in PENDING status
 * 3. Platform admin reviews documents via video call
 * 4. Admin approves/rejects the land registration
 * 5. Once approved, land becomes active for leasing
 *
 * === FEATURES ===
 * - Document-based ownership verification (deed, title, etc.)
 * - Admin video call verification requirement
 * - Plot division and individual leasing
 * - Non-transferable lease NFTs (soulbound)
 * - 90/10 revenue split
 */
contract ResonanceLands is ERC721URIStorage, Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ============================================
    // Constants
    // ============================================
    uint256 public constant MIN_CREDIT_SCORE = 100;
    uint256 public constant MIN_LAND_AREA = 10;          // 10 m²
    uint256 public constant MAX_LAND_AREA = 1_000_000;   // 1,000,000 m² (100 hectares)
    uint256 public constant MIN_PLOT_SIZE = 5;           // 5 m²
    uint256 public constant MAX_PLOTS_PER_LAND = 1000;
    uint256 public constant OWNER_PERCENTAGE = 90;
    uint256 public constant PLATFORM_PERCENTAGE = 10;

    // ============================================
    // Enums
    // ============================================
    enum LandStatus { PENDING, APPROVED, REJECTED, SUSPENDED }

    // ============================================
    // Interfaces
    // ============================================
    IPassportNFT public immutable passportNFT;
    IERC20 public immutable wmonToken;
    address public platformWallet;
    address public verificationOracle;  // Can approve/reject land registrations

    // ============================================
    // Counters
    // ============================================
    uint256 private _landIdCounter;
    uint256 private _leaseTokenIdCounter;

    // ============================================
    // Structs
    // ============================================
    struct OwnershipProof {
        string deedDocumentIPFS;       // Property deed/title document
        string governmentIdIPFS;       // Owner's government ID
        string utilityBillIPFS;        // Utility bill showing address (optional)
        string additionalProofIPFS;    // Any additional proof
        uint256 submittedAt;
        string verificationNotes;      // Admin notes from verification call
    }

    struct Land {
        uint256 landId;
        uint256 ownerFid;              // Farcaster FID
        address ownerAddress;
        uint256 passportTokenId;
        string name;
        string description;
        string country;
        string region;
        string streetAddress;          // Physical address
        int256 latitude;               // GPS lat * 1e6
        int256 longitude;              // GPS lon * 1e6
        uint256 totalArea;             // in m²
        uint256 plotSize;              // Size per plot in m²
        uint256 totalPlots;
        uint256 pricePerPlotPerDay;    // WMON per plot per day
        string[] imageIPFS;            // Multiple land photos
        uint256 registeredAt;
        LandStatus status;
        uint256 verifiedAt;
        uint256 totalLeases;
        uint256 totalEarnings;
    }

    struct Plot {
        uint256 landId;
        uint256 plotIndex;
        bool isLeased;
        uint256 currentLeaseId;
    }

    struct Lease {
        uint256 leaseId;
        uint256 landId;
        uint256 plotIndex;
        uint256 tenantFid;
        address tenantAddress;
        uint256 startTime;
        uint256 endTime;
        uint256 totalPaid;
        bool active;
        string purpose;
    }

    // ============================================
    // Mappings
    // ============================================
    mapping(uint256 => Land) public lands;
    mapping(uint256 => OwnershipProof) public ownershipProofs;
    mapping(uint256 => mapping(uint256 => Plot)) public plots;
    mapping(uint256 => Lease) public leases;
    mapping(uint256 => uint256[]) public landsByFid;
    mapping(uint256 => uint256[]) public leasesByFid;
    mapping(address => uint256[]) public landsByAddress;

    // ============================================
    // Events
    // ============================================
    event LandSubmitted(
        uint256 indexed landId,
        uint256 indexed ownerFid,
        address ownerAddress,
        string name,
        string country,
        uint256 totalArea
    );

    event LandApproved(uint256 indexed landId, uint256 verifiedAt, string notes);
    event LandRejected(uint256 indexed landId, string reason);
    event LandSuspended(uint256 indexed landId, string reason);
    event LandUpdated(uint256 indexed landId);

    event LeaseCreated(
        uint256 indexed leaseId,
        uint256 indexed landId,
        uint256 plotIndex,
        uint256 indexed tenantFid,
        uint256 startTime,
        uint256 endTime,
        uint256 totalPaid
    );

    event LeaseEnded(uint256 indexed leaseId, uint256 indexed landId, uint256 plotIndex);

    // ============================================
    // Constructor
    // ============================================
    constructor(
        address _passportNFT,
        address _wmonToken,
        address _platformWallet
    ) ERC721("ResonanceLands Lease", "RSLEASE") Ownable(msg.sender) {
        require(_passportNFT != address(0), "Invalid passport address");
        require(_wmonToken != address(0), "Invalid WMON address");
        require(_platformWallet != address(0), "Invalid platform wallet");

        passportNFT = IPassportNFT(_passportNFT);
        wmonToken = IERC20(_wmonToken);
        platformWallet = _platformWallet;
        verificationOracle = msg.sender;
    }

    // ============================================
    // Land Registration (Requires Proof Documents)
    // ============================================

    /**
     * @notice Submit land for registration with ownership proof
     * @dev Land starts in PENDING status until admin verification
     */
    function submitLand(
        uint256 passportTokenId,
        string calldata name,
        string calldata description,
        string calldata country,
        string calldata region,
        string calldata streetAddress,
        int256 latitude,
        int256 longitude,
        uint256 totalArea,
        uint256 plotSize,
        uint256 pricePerPlotPerDay,
        string[] calldata imageIPFS,
        // Ownership proof documents
        string calldata deedDocumentIPFS,
        string calldata governmentIdIPFS,
        string calldata utilityBillIPFS,
        string calldata additionalProofIPFS
    ) external whenNotPaused nonReentrant returns (uint256 landId) {
        // Validate passport ownership
        require(passportNFT.ownerOf(passportTokenId) == msg.sender, "Not passport owner");

        // Get passport data
        (uint256 userFid,,,,,,,,) = passportNFT.getPassportData(passportTokenId);
        require(userFid > 0, "Invalid passport data");

        // Check credit score
        uint256 creditScore = passportNFT.getCreditScore(passportTokenId);
        require(creditScore >= MIN_CREDIT_SCORE, "Credit score too low (min 100)");

        // Validate land parameters
        require(bytes(name).length > 0 && bytes(name).length <= 100, "Invalid name");
        require(totalArea >= MIN_LAND_AREA && totalArea <= MAX_LAND_AREA, "Invalid area");
        require(plotSize >= MIN_PLOT_SIZE && plotSize <= totalArea, "Invalid plot size");
        require(pricePerPlotPerDay > 0, "Price required");
        require(latitude >= -90000000 && latitude <= 90000000, "Invalid latitude");
        require(longitude >= -180000000 && longitude <= 180000000, "Invalid longitude");

        // CRITICAL: Require ownership proof document
        require(bytes(deedDocumentIPFS).length > 0, "Deed document required");
        require(bytes(governmentIdIPFS).length > 0, "Government ID required");

        // Calculate plots
        uint256 totalPlots = totalArea / plotSize;
        require(totalPlots > 0 && totalPlots <= MAX_PLOTS_PER_LAND, "Invalid plot count");

        // Create land in PENDING status
        landId = ++_landIdCounter;

        lands[landId] = Land({
            landId: landId,
            ownerFid: userFid,
            ownerAddress: msg.sender,
            passportTokenId: passportTokenId,
            name: name,
            description: description,
            country: country,
            region: region,
            streetAddress: streetAddress,
            latitude: latitude,
            longitude: longitude,
            totalArea: totalArea,
            plotSize: plotSize,
            totalPlots: totalPlots,
            pricePerPlotPerDay: pricePerPlotPerDay,
            imageIPFS: imageIPFS,
            registeredAt: block.timestamp,
            status: LandStatus.PENDING,  // Starts as PENDING
            verifiedAt: 0,
            totalLeases: 0,
            totalEarnings: 0
        });

        // Store ownership proof separately
        ownershipProofs[landId] = OwnershipProof({
            deedDocumentIPFS: deedDocumentIPFS,
            governmentIdIPFS: governmentIdIPFS,
            utilityBillIPFS: utilityBillIPFS,
            additionalProofIPFS: additionalProofIPFS,
            submittedAt: block.timestamp,
            verificationNotes: ""
        });

        // Initialize plots
        for (uint256 i = 0; i < totalPlots; i++) {
            plots[landId][i] = Plot({
                landId: landId,
                plotIndex: i,
                isLeased: false,
                currentLeaseId: 0
            });
        }

        // Track by FID and address
        landsByFid[userFid].push(landId);
        landsByAddress[msg.sender].push(landId);

        emit LandSubmitted(landId, userFid, msg.sender, name, country, totalArea);
    }

    // ============================================
    // Verification Functions (Oracle/Admin Only)
    // ============================================

    /**
     * @notice Approve a land registration after document verification
     * @dev Only verificationOracle or owner can approve
     */
    function approveLand(uint256 landId, string calldata verificationNotes) external {
        require(msg.sender == verificationOracle || msg.sender == owner(), "Not authorized");
        require(lands[landId].landId > 0, "Land not found");
        require(lands[landId].status == LandStatus.PENDING, "Not pending");

        lands[landId].status = LandStatus.APPROVED;
        lands[landId].verifiedAt = block.timestamp;
        ownershipProofs[landId].verificationNotes = verificationNotes;

        emit LandApproved(landId, block.timestamp, verificationNotes);
    }

    /**
     * @notice Reject a land registration
     */
    function rejectLand(uint256 landId, string calldata reason) external {
        require(msg.sender == verificationOracle || msg.sender == owner(), "Not authorized");
        require(lands[landId].landId > 0, "Land not found");
        require(lands[landId].status == LandStatus.PENDING, "Not pending");

        lands[landId].status = LandStatus.REJECTED;
        ownershipProofs[landId].verificationNotes = reason;

        emit LandRejected(landId, reason);
    }

    /**
     * @notice Suspend an approved land (e.g., fraud detected)
     */
    function suspendLand(uint256 landId, string calldata reason) external {
        require(msg.sender == verificationOracle || msg.sender == owner(), "Not authorized");
        require(lands[landId].landId > 0, "Land not found");

        lands[landId].status = LandStatus.SUSPENDED;
        ownershipProofs[landId].verificationNotes = reason;

        emit LandSuspended(landId, reason);
    }

    // ============================================
    // Leasing Functions
    // ============================================

    /**
     * @notice Lease a plot (only works for APPROVED lands)
     */
    function leasePlot(
        uint256 landId,
        uint256 plotIndex,
        uint256 durationDays,
        string calldata purpose,
        uint256 tenantFid
    ) external whenNotPaused nonReentrant returns (uint256 leaseId) {
        Land storage land = lands[landId];
        require(land.status == LandStatus.APPROVED, "Land not approved");
        require(plotIndex < land.totalPlots, "Invalid plot");
        require(durationDays >= 1 && durationDays <= 365, "Invalid duration");
        require(tenantFid > 0, "Invalid FID");

        Plot storage plot = plots[landId][plotIndex];
        require(!plot.isLeased, "Plot already leased");

        // Calculate and transfer payment
        uint256 totalCost = land.pricePerPlotPerDay * durationDays;
        uint256 platformFee = (totalCost * PLATFORM_PERCENTAGE) / 100;
        uint256 ownerPayment = totalCost - platformFee;

        wmonToken.safeTransferFrom(msg.sender, platformWallet, platformFee);
        wmonToken.safeTransferFrom(msg.sender, land.ownerAddress, ownerPayment);

        // Create lease
        leaseId = ++_leaseTokenIdCounter;

        leases[leaseId] = Lease({
            leaseId: leaseId,
            landId: landId,
            plotIndex: plotIndex,
            tenantFid: tenantFid,
            tenantAddress: msg.sender,
            startTime: block.timestamp,
            endTime: block.timestamp + (durationDays * 1 days),
            totalPaid: totalCost,
            active: true,
            purpose: purpose
        });

        plot.isLeased = true;
        plot.currentLeaseId = leaseId;
        land.totalLeases++;
        land.totalEarnings += ownerPayment;
        leasesByFid[tenantFid].push(leaseId);

        // Mint soulbound lease NFT
        _safeMint(msg.sender, leaseId);

        emit LeaseCreated(leaseId, landId, plotIndex, tenantFid, block.timestamp, leases[leaseId].endTime, totalCost);
    }

    /**
     * @notice End expired lease
     */
    function endLease(uint256 leaseId) external {
        Lease storage lease = leases[leaseId];
        require(lease.active, "Not active");
        require(block.timestamp >= lease.endTime, "Not expired");

        plots[lease.landId][lease.plotIndex].isLeased = false;
        plots[lease.landId][lease.plotIndex].currentLeaseId = 0;
        lease.active = false;

        emit LeaseEnded(leaseId, lease.landId, lease.plotIndex);
    }

    // ============================================
    // View Functions
    // ============================================

    function getLandsByFid(uint256 fid) external view returns (uint256[] memory) {
        return landsByFid[fid];
    }

    function getLandsByAddress(address owner) external view returns (uint256[] memory) {
        return landsByAddress[owner];
    }

    function getLeasesByFid(uint256 fid) external view returns (uint256[] memory) {
        return leasesByFid[fid];
    }

    function getPendingLands() external view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 1; i <= _landIdCounter; i++) {
            if (lands[i].status == LandStatus.PENDING) count++;
        }

        uint256[] memory pending = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 1; i <= _landIdCounter; i++) {
            if (lands[i].status == LandStatus.PENDING) {
                pending[idx++] = i;
            }
        }
        return pending;
    }

    function getAvailablePlots(uint256 landId) external view returns (uint256[] memory) {
        Land storage land = lands[landId];
        uint256 count = 0;

        for (uint256 i = 0; i < land.totalPlots; i++) {
            if (!plots[landId][i].isLeased) count++;
        }

        uint256[] memory available = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < land.totalPlots; i++) {
            if (!plots[landId][i].isLeased) {
                available[idx++] = i;
            }
        }
        return available;
    }

    function isLandOwner(uint256 fid) external view returns (bool) {
        uint256[] memory userLands = landsByFid[fid];
        for (uint256 i = 0; i < userLands.length; i++) {
            if (lands[userLands[i]].status == LandStatus.APPROVED) {
                return true;
            }
        }
        return false;
    }

    function getOwnershipProof(uint256 landId) external view returns (
        string memory deedDocumentIPFS,
        string memory governmentIdIPFS,
        string memory utilityBillIPFS,
        string memory additionalProofIPFS,
        uint256 submittedAt,
        string memory verificationNotes
    ) {
        OwnershipProof storage proof = ownershipProofs[landId];
        return (
            proof.deedDocumentIPFS,
            proof.governmentIdIPFS,
            proof.utilityBillIPFS,
            proof.additionalProofIPFS,
            proof.submittedAt,
            proof.verificationNotes
        );
    }

    // ============================================
    // Admin Functions
    // ============================================

    function setVerificationOracle(address _oracle) external onlyOwner {
        require(_oracle != address(0), "Invalid address");
        verificationOracle = _oracle;
    }

    function setPlatformWallet(address _wallet) external onlyOwner {
        require(_wallet != address(0), "Invalid address");
        platformWallet = _wallet;
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ============================================
    // Soulbound Override (Non-Transferable)
    // ============================================

    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            revert("Lease NFTs are non-transferable");
        }
        return super._update(to, tokenId, auth);
    }
}
