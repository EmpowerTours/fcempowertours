// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

import "./LicenseRegistry.sol";

/**
 * @title SalesController
 * @notice Policy layer for EmpowerTours V3: minting authorisation, pricing, payment
 *         splits, referral accrual, and resale. Swappable — the registry holds ownership,
 *         this holds every rule that could reasonably change.
 *
 * Fixes carried from the V2 audit (docs/V3_DESIGN.md):
 *   C1  `executeSaleFor` had no caller authorisation, so any address could force a sale
 *       between any two parties at a price of its choosing, bounded only by the victim's
 *       outstanding token allowance. Here a sale requires the seller's signature over the
 *       exact terms, and the buyer is msg.sender — both sides consent to the same order.
 *   M5  `artist` was a free parameter with nothing tying it to the caller. Direct minting
 *       binds the artist to msg.sender; delegated minting requires the artist's signature
 *       over every field being minted.
 *
 * Payment shape. Nothing is taken from the artist to pay a referrer:
 *
 *   price
 *   ├─ treasury  = price * treasuryFeeBps / 10000
 *   │  ├─ referrer accrual = treasury * referrerBps / 10000   (pull, never push)
 *   │  └─ platform         = remainder
 *   └─ artistCut = price - treasury
 *      ├─ royalty sink = artistCut * royaltyShareBps / 10000  (Clearwave offering)
 *      └─ artist       = remainder
 */
contract SalesController is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ------------------------------------------------------------------ types

    struct MintRequest {
        address artist;
        uint256 artistFid;
        string uri;
        uint32 maxCollectorEditions;
        address referrer;
        uint96 royaltyBps;
        uint8 nftType;
        uint256 price;
        uint256 collectorPrice;
        uint256 nonce;
        uint256 deadline;
    }

    struct SaleOrder {
        uint256 licenseId;
        address seller;
        uint256 price;
        uint256 nonce;
        uint256 deadline;
    }

    struct Pricing {
        uint256 price;
        uint256 collectorPrice;
        bool salesPaused;
    }

    // --------------------------------------------------------------- constants

    uint256 public constant BPS_DENOMINATOR = 10_000;

    /// @dev Governance may never route more than half the platform fee to a referrer.
    uint96 public constant MAX_REFERRER_BPS = 5_000;

    /// @dev Nor take more than 30% of a sale as platform fee.
    uint96 public constant MAX_TREASURY_FEE_BPS = 3_000;

    /// @dev Nor let a resale royalty exceed half the sale price.
    uint96 public constant MAX_RESALE_ROYALTY_BPS = 5_000;

    bytes32 private constant MINT_TYPEHASH = keccak256(
        "MintRequest(address artist,uint256 artistFid,string uri,uint32 maxCollectorEditions,address referrer,uint96 royaltyBps,uint8 nftType,uint256 price,uint256 collectorPrice,uint256 nonce,uint256 deadline)"
    );

    bytes32 private constant SALE_TYPEHASH = keccak256(
        "SaleOrder(uint256 licenseId,address seller,uint256 price,uint256 nonce,uint256 deadline)"
    );

    // ------------------------------------------------------------------ state

    LicenseRegistry public immutable registry;
    IERC20 public immutable paymentToken;

    address public governance;
    address public pendingGovernance;
    address public treasury;

    uint96 public treasuryFeeBps = 1_000; // 10%
    uint96 public referrerBps; // 0 until volume justifies switching it on
    uint64 public referralWindow = 365 days;

    mapping(uint256 => Pricing) public pricing;
    mapping(address => uint256) public referralBalance;
    /// @dev Keyed by artist, not by master. Attribution attaches to the *artist* — a
    ///      referrer earns across everything that artist mints, for {referralWindow} from
    ///      that artist's first sale. Keying this by master would restart the clock on
    ///      every new upload, which is "paying forever for one introduction".
    mapping(address => uint64) public artistFirstSaleAt;
    mapping(address => mapping(uint256 => bool)) public usedNonces;

    // ----------------------------------------------------------------- events

    event MasterCreated(uint256 indexed masterTokenId, address indexed artist, address referrer);
    event LicensePurchased(
        uint256 indexed licenseId,
        uint256 indexed masterTokenId,
        address indexed buyer,
        uint256 price,
        bool isCollector
    );
    event Paid(uint256 indexed masterTokenId, address indexed artist, uint256 toArtist, uint256 toSink, uint256 toTreasury);
    event ReferralAccrued(address indexed referrer, uint256 indexed masterTokenId, uint256 amount);
    event ReferralClaimed(address indexed referrer, uint256 amount);
    event SaleExecuted(uint256 indexed licenseId, address indexed seller, address indexed buyer, uint256 price, uint256 royalty);
    event PricingSet(uint256 indexed masterTokenId, uint256 price, uint256 collectorPrice);
    event SalesPausedSet(uint256 indexed masterTokenId, bool paused);
    event ParameterSet(bytes32 indexed key, uint256 value);
    event GovernanceTransferStarted(address indexed from, address indexed to);
    event GovernanceTransferred(address indexed from, address indexed to);

    // ----------------------------------------------------------------- errors

    error NotGovernance();
    error NotPendingGovernance();
    error NotArtist();
    error NotSellerOfRecord();
    error ZeroAddress();
    error ZeroPrice();
    error SalesPaused(uint256 masterTokenId);
    error SignatureExpired(uint256 deadline);
    error NonceAlreadyUsed(address signer, uint256 nonce);
    error BadSignature();
    error PaymentNotReceived(address to, uint256 expected, uint256 actual);
    error BpsTooHigh(uint96 value, uint96 max);
    error NothingToClaim();
    error CannotBuyOwnListing();

    // -------------------------------------------------------------- modifiers

    modifier onlyGovernance() {
        if (msg.sender != governance) revert NotGovernance();
        _;
    }

    // ------------------------------------------------------------ constructor

    constructor(
        LicenseRegistry registry_,
        IERC20 paymentToken_,
        address governance_,
        address treasury_
    ) EIP712("EmpowerToursSales", "1") {
        if (
            address(registry_) == address(0) || address(paymentToken_) == address(0)
                || governance_ == address(0) || treasury_ == address(0)
        ) revert ZeroAddress();
        registry = registry_;
        paymentToken = paymentToken_;
        governance = governance_;
        treasury = treasury_;
    }

    // ----------------------------------------------------------------- minting

    /// @notice Mint your own master. The artist is msg.sender; no signature needed.
    function mintMaster(
        uint256 artistFid,
        string calldata uri,
        uint32 maxCollectorEditions,
        address referrer,
        uint96 royaltyBps,
        uint8 nftType,
        uint256 price,
        uint256 collectorPrice
    ) external nonReentrant returns (uint256 masterTokenId) {
        masterTokenId = _createMaster(
            msg.sender, artistFid, uri, maxCollectorEditions, referrer, royaltyBps, nftType, price, collectorPrice
        );
    }

    /**
     * @notice Mint on an artist's behalf. Anyone may relay; the artist must have signed.
     * @dev The signature covers every minted field. Signing only the artist address would
     *      let a relayer substitute a different uri, price, or royalty and mint it under
     *      that artist's name.
     */
    function mintMasterFor(MintRequest calldata req, bytes calldata signature)
        external
        nonReentrant
        returns (uint256 masterTokenId)
    {
        _consumeSignature(
            req.artist,
            req.nonce,
            req.deadline,
            keccak256(
                abi.encode(
                    MINT_TYPEHASH,
                    req.artist,
                    req.artistFid,
                    keccak256(bytes(req.uri)),
                    req.maxCollectorEditions,
                    req.referrer,
                    req.royaltyBps,
                    req.nftType,
                    req.price,
                    req.collectorPrice,
                    req.nonce,
                    req.deadline
                )
            ),
            signature
        );

        masterTokenId = _createMaster(
            req.artist,
            req.artistFid,
            req.uri,
            req.maxCollectorEditions,
            req.referrer,
            req.royaltyBps,
            req.nftType,
            req.price,
            req.collectorPrice
        );
    }

    function _createMaster(
        address artist,
        uint256 artistFid,
        string calldata uri,
        uint32 maxCollectorEditions,
        address referrer,
        uint96 royaltyBps,
        uint8 nftType,
        uint256 price,
        uint256 collectorPrice
    ) private returns (uint256 masterTokenId) {
        if (price == 0) revert ZeroPrice();
        if (royaltyBps > MAX_RESALE_ROYALTY_BPS) {
            revert BpsTooHigh(royaltyBps, MAX_RESALE_ROYALTY_BPS);
        }

        masterTokenId =
            registry.mintMaster(artist, artistFid, uri, maxCollectorEditions, referrer, royaltyBps, nftType);

        pricing[masterTokenId] =
            Pricing({price: price, collectorPrice: collectorPrice, salesPaused: false});

        emit MasterCreated(masterTokenId, artist, referrer);
        emit PricingSet(masterTokenId, price, collectorPrice);
    }

    // ---------------------------------------------------------------- purchase

    function purchase(uint256 masterTokenId, bool isCollector, string calldata uri)
        external
        nonReentrant
        returns (uint256 licenseId)
    {
        Pricing memory p = pricing[masterTokenId];
        if (p.salesPaused) revert SalesPaused(masterTokenId);

        uint256 price = isCollector ? p.collectorPrice : p.price;
        if (price == 0) revert ZeroPrice();

        LicenseRegistry.Master memory m = registry.getMaster(masterTokenId);

        // Mint first so the cap is enforced before any value moves. A sold-out collector
        // tier must revert without having taken payment.
        licenseId = registry.mintLicense(
            masterTokenId, msg.sender, isCollector, uri, _resaleRoyaltyFor(m, isCollector)
        );

        _settle(masterTokenId, m, price);

        if (artistFirstSaleAt[m.artist] == 0) {
            artistFirstSaleAt[m.artist] = uint64(block.timestamp);
        }

        emit LicensePurchased(licenseId, masterTokenId, msg.sender, price, isCollector);
    }

    /**
     * @dev Every leg is measured, never assumed. A fee-on-transfer or rebasing payment
     *      token would otherwise silently short the artist while the call succeeded.
     */
    function _settle(uint256 masterTokenId, LicenseRegistry.Master memory m, uint256 price)
        private
    {
        uint256 treasuryAmount = (price * treasuryFeeBps) / BPS_DENOMINATOR;
        uint256 artistCut = price - treasuryAmount;

        uint256 toSink;
        if (m.royaltyShareSink != address(0) && m.royaltyShareBps > 0) {
            toSink = (artistCut * m.royaltyShareBps) / BPS_DENOMINATOR;
        }
        uint256 toArtist = artistCut - toSink;

        uint256 referrerAmount;
        address ref = m.referrer;
        if (ref != address(0) && referrerBps > 0 && _withinReferralWindow(m.artist)) {
            referrerAmount = (treasuryAmount * referrerBps) / BPS_DENOMINATOR;
        }
        uint256 toTreasury = treasuryAmount - referrerAmount;

        _pull(msg.sender, m.artist, toArtist);
        if (toSink > 0) _pull(msg.sender, m.royaltyShareSink, toSink);
        if (toTreasury > 0) _pull(msg.sender, treasury, toTreasury);

        if (referrerAmount > 0) {
            // Accrue, never transfer. A referrer contract that reverts on receive would
            // otherwise brick every purchase of that artist's work.
            _pull(msg.sender, address(this), referrerAmount);
            referralBalance[ref] += referrerAmount;
            emit ReferralAccrued(ref, masterTokenId, referrerAmount);
        }

        emit Paid(masterTokenId, m.artist, toArtist, toSink, toTreasury);
    }

    function _pull(address from, address to, uint256 amount) private {
        if (amount == 0) return;
        uint256 before = paymentToken.balanceOf(to);
        paymentToken.safeTransferFrom(from, to, amount);
        uint256 received = paymentToken.balanceOf(to) - before;
        if (received != amount) revert PaymentNotReceived(to, amount, received);
    }

    function _withinReferralWindow(address artist) private view returns (bool) {
        uint64 start = artistFirstSaleAt[artist];
        if (start == 0) return true; // the artist's first sale is itself inside the window
        return block.timestamp <= start + referralWindow;
    }

    function _resaleRoyaltyFor(LicenseRegistry.Master memory, bool isCollector)
        private
        view
        returns (uint96)
    {
        return isCollector ? collectorResaleRoyaltyBps : standardResaleRoyaltyBps;
    }

    uint96 public standardResaleRoyaltyBps = 5_000; // unlimited supply: affiliate-shaped
    uint96 public collectorResaleRoyaltyBps = 750; // capped supply: keep resale liquid

    // ------------------------------------------------------------------ resale

    /**
     * @notice Buy a listed licence. Called by the buyer; the seller must have signed the
     *         exact terms.
     * @dev This is the C1 fix. Both sides consent to the same order: the seller by
     *      signature over (licenceId, seller, price, nonce, deadline), the buyer by being
     *      msg.sender and paying. No third party can move anyone's funds.
     */
    function executeSale(SaleOrder calldata order, bytes calldata sellerSignature)
        external
        nonReentrant
    {
        if (order.seller == msg.sender) revert CannotBuyOwnListing();
        if (registry.ownerOf(order.licenseId) != order.seller) revert NotSellerOfRecord();

        _consumeSignature(
            order.seller,
            order.nonce,
            order.deadline,
            keccak256(
                abi.encode(
                    SALE_TYPEHASH, order.licenseId, order.seller, order.price, order.nonce, order.deadline
                )
            ),
            sellerSignature
        );

        (address royaltyRecipient, uint256 royaltyAmount) =
            registry.royaltyInfo(order.licenseId, order.price);
        uint256 sellerProceeds = order.price - royaltyAmount;

        if (royaltyAmount > 0) _pull(msg.sender, royaltyRecipient, royaltyAmount);
        if (sellerProceeds > 0) _pull(msg.sender, order.seller, sellerProceeds);

        registry.transferFrom(order.seller, msg.sender, order.licenseId);

        emit SaleExecuted(order.licenseId, order.seller, msg.sender, order.price, royaltyAmount);
    }

    // -------------------------------------------------------------- referrals

    function claimReferral() external nonReentrant {
        uint256 amount = referralBalance[msg.sender];
        if (amount == 0) revert NothingToClaim();
        referralBalance[msg.sender] = 0;
        paymentToken.safeTransfer(msg.sender, amount);
        emit ReferralClaimed(msg.sender, amount);
    }

    // --------------------------------------------------------------- signatures

    function _consumeSignature(
        address signer,
        uint256 nonce,
        uint256 deadline,
        bytes32 structHash,
        bytes calldata signature
    ) private {
        if (block.timestamp > deadline) revert SignatureExpired(deadline);
        if (usedNonces[signer][nonce]) revert NonceAlreadyUsed(signer, nonce);

        // ECDSA for EOAs, ERC-1271 for smart accounts. Every user holds a Safe, and a
        // Safe cannot produce an ECDSA signature over its own address.
        if (!SignatureChecker.isValidSignatureNow(signer, _hashTypedDataV4(structHash), signature)) {
            revert BadSignature();
        }
        usedNonces[signer][nonce] = true;
    }

    // ------------------------------------------------------------------- artist

    function setPricing(uint256 masterTokenId, uint256 price, uint256 collectorPrice) external {
        if (registry.getMaster(masterTokenId).artist != msg.sender) revert NotArtist();
        if (price == 0) revert ZeroPrice();
        pricing[masterTokenId].price = price;
        pricing[masterTokenId].collectorPrice = collectorPrice;
        emit PricingSet(masterTokenId, price, collectorPrice);
    }

    function setSalesPaused(uint256 masterTokenId, bool paused) external {
        if (registry.getMaster(masterTokenId).artist != msg.sender) revert NotArtist();
        pricing[masterTokenId].salesPaused = paused;
        emit SalesPausedSet(masterTokenId, paused);
    }

    /// @notice Bind a master to a Clearwave royalty offering. Write-once in the registry.
    function setRoyaltyShare(uint256 masterTokenId, uint96 bps, address sink) external {
        if (registry.getMaster(masterTokenId).artist != msg.sender) revert NotArtist();
        registry.setRoyaltyShare(masterTokenId, bps, sink);
    }

    // --------------------------------------------------------------- governance

    function setTreasuryFeeBps(uint96 v) external onlyGovernance {
        if (v > MAX_TREASURY_FEE_BPS) revert BpsTooHigh(v, MAX_TREASURY_FEE_BPS);
        treasuryFeeBps = v;
        emit ParameterSet("treasuryFeeBps", v);
    }

    function setReferrerBps(uint96 v) external onlyGovernance {
        if (v > MAX_REFERRER_BPS) revert BpsTooHigh(v, MAX_REFERRER_BPS);
        referrerBps = v;
        emit ParameterSet("referrerBps", v);
    }

    function setReferralWindow(uint64 v) external onlyGovernance {
        referralWindow = v;
        emit ParameterSet("referralWindow", v);
    }

    /// @dev Applies to licences minted after this call only. Existing licences carry their
    ///      own rate, snapshotted at mint — a holder's resale economics were part of what
    ///      they bought.
    function setResaleRoyaltyBps(uint96 standardBps, uint96 collectorBps)
        external
        onlyGovernance
    {
        if (standardBps > MAX_RESALE_ROYALTY_BPS) {
            revert BpsTooHigh(standardBps, MAX_RESALE_ROYALTY_BPS);
        }
        if (collectorBps > MAX_RESALE_ROYALTY_BPS) {
            revert BpsTooHigh(collectorBps, MAX_RESALE_ROYALTY_BPS);
        }
        standardResaleRoyaltyBps = standardBps;
        collectorResaleRoyaltyBps = collectorBps;
        emit ParameterSet("standardResaleRoyaltyBps", standardBps);
        emit ParameterSet("collectorResaleRoyaltyBps", collectorBps);
    }

    function setTreasury(address v) external onlyGovernance {
        if (v == address(0)) revert ZeroAddress();
        treasury = v;
    }

    function setGovernance(address v) external onlyGovernance {
        if (v == address(0)) revert ZeroAddress();
        pendingGovernance = v;
        emit GovernanceTransferStarted(governance, v);
    }

    function acceptGovernance() external {
        if (msg.sender != pendingGovernance) revert NotPendingGovernance();
        address previous = governance;
        governance = msg.sender;
        pendingGovernance = address(0);
        emit GovernanceTransferred(previous, msg.sender);
    }

    // ------------------------------------------------------------------- views

    function priceOf(uint256 masterTokenId, bool isCollector) external view returns (uint256) {
        Pricing memory p = pricing[masterTokenId];
        return isCollector ? p.collectorPrice : p.price;
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}
