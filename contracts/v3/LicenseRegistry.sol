// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title LicenseRegistry
 * @notice Immutable core for EmpowerTours V3. Holds ownership and facts; holds no policy.
 *
 * Deployed once and never replaced. Everything that could reasonably change — pricing,
 * access rules, royalty rates, sale authorisation, referral accrual — lives in swappable
 * modules behind {controller}. See docs/V3_DESIGN.md.
 *
 * What this contract guarantees, and no module can override:
 *   - Masters are soulbound. An artist cannot sell authorship.
 *   - Collector supply caps are absolute. Scarcity is a promise buyers paid for.
 *   - Only the controller mints. Only an owner or an approved operator burns — the
 *     controller's implicit operator status covers licence *transfers* only, never burns.
 *   - Ownership is the single source of truth for who holds a licence. There is no
 *     secondary index to fall out of sync (this is what broke `hasValidLicense` in V2).
 *
 * Deliberately absent versus V2:
 *   - No `expiry` / `active` on a licence. Licences are perpetual; access policy lives in
 *     a module and reads {mintedAt} if it ever needs to.
 *   - No `licensee` field. `ownerOf` is authoritative — a duplicate went stale on resale.
 *   - No `userLicenses` array. It was only appended at mint, so after a resale the seller
 *     still passed an ownership check and the buyer failed it.
 *   - No staking. It produced two bugs in V2 and had no call sites in the app.
 */
contract LicenseRegistry is ERC721URIStorage, ERC2981, ReentrancyGuard {
    // ------------------------------------------------------------------ types

    struct Master {
        address artist;
        uint256 artistFid; // required, nonzero. See docs/V3_DESIGN.md "Identity"
        uint64 createdAt;
        uint32 maxCollectorEditions; // 0 = no collector tier for this master
        uint32 collectorsMinted;
        address referrer; // set once at mint, immutable
        uint96 royaltyShareBps; // set once when an offering exists, immutable
        address royaltyShareSink; // set once, immutable
    }

    struct License {
        uint256 masterTokenId;
        uint64 mintedAt;
        bool isCollector;
    }

    // ------------------------------------------------------------------ state

    /**
     * @dev Master ids count up from 1; licence ids from LICENSE_ID_OFFSET. Keeping the
     *      ranges disjoint means a token's kind is derivable from its id alone, with no
     *      lookup and no ambiguity. V2 relied on the same convention implicitly; here it
     *      is enforced.
     */
    uint256 public constant LICENSE_ID_OFFSET = 1_000_000;

    uint256 private _masterCounter;
    uint256 private _licenseCounter = LICENSE_ID_OFFSET;

    mapping(uint256 => Master) private _masters;
    mapping(uint256 => License) private _licenses;

    /// @notice Only address permitted to mint. Expected to be the SalesController module.
    address public controller;

    /// @notice Parameter authority. A multisig now, a Timelock later — see {setGovernance}.
    address public governance;
    address public pendingGovernance;

    // -------------------------------------------------------------- constants

    /// @dev Ceiling on collector editions, matching V2. A cap of 0 disables the tier.
    uint32 public constant MAX_COLLECTOR_EDITIONS = 1000;

    /// @dev Governance may not push a secondary royalty above this. It constrains the
    ///      party that would otherwise be unconstrained.
    uint96 public constant HARD_MAX_ROYALTY_BPS = 5000;

    // ----------------------------------------------------------------- events

    event MasterMinted(
        uint256 indexed masterTokenId,
        address indexed artist,
        uint256 indexed artistFid,
        address referrer,
        uint8 nftType
    );
    event LicenseMinted(
        uint256 indexed licenseId,
        uint256 indexed masterTokenId,
        address indexed to,
        bool isCollector
    );
    event TokenBurned(uint256 indexed tokenId, address indexed owner);
    event RoyaltyShareSet(uint256 indexed masterTokenId, uint96 bps, address sink);
    event ControllerSet(address indexed controller);
    event GovernanceTransferStarted(address indexed from, address indexed to);
    event GovernanceTransferred(address indexed from, address indexed to);

    // ----------------------------------------------------------------- errors

    error NotController();
    error NotGovernance();
    error NotOwnerNorApproved();
    error ZeroAddress();
    error FidRequired();
    error MasterNotFound(uint256 masterTokenId);
    error CollectorTierUnavailable(uint256 masterTokenId);
    error CollectorEditionsSoldOut(uint256 masterTokenId);
    error InvalidEditionCount(uint32 requested, uint32 max);
    error RoyaltyTooHigh(uint96 bps, uint96 max);
    error RoyaltyShareAlreadySet(uint256 masterTokenId);
    error MastersAreSoulbound();
    error GovernanceCannotBeRenounced();
    error NotPendingGovernance();

    // -------------------------------------------------------------- modifiers

    modifier onlyController() {
        if (msg.sender != controller) revert NotController();
        _;
    }

    modifier onlyGovernance() {
        if (msg.sender != governance) revert NotGovernance();
        _;
    }

    // ------------------------------------------------------------ constructor

    constructor(address initialGovernance) ERC721("EmpowerTours", "ETNFT") {
        if (initialGovernance == address(0)) revert ZeroAddress();
        governance = initialGovernance;
        emit GovernanceTransferred(address(0), initialGovernance);
    }

    // ------------------------------------------------------------------ admin

    function setController(address newController) external onlyGovernance {
        if (newController == address(0)) revert ZeroAddress();
        controller = newController;
        emit ControllerSet(newController);
    }

    /**
     * @notice Begin handing parameter authority to a new address.
     * @dev Two-step deliberately. A one-step transfer to a mistyped or non-functional
     *      address permanently freezes every parameter in the system, with no recovery.
     */
    function setGovernance(address newGovernance) external onlyGovernance {
        if (newGovernance == address(0)) revert ZeroAddress();
        pendingGovernance = newGovernance;
        emit GovernanceTransferStarted(governance, newGovernance);
    }

    function acceptGovernance() external {
        if (msg.sender != pendingGovernance) revert NotPendingGovernance();
        address previous = governance;
        governance = msg.sender;
        pendingGovernance = address(0);
        emit GovernanceTransferred(previous, msg.sender);
    }

    /// @notice Disabled. An ungoverned registry can never set a controller again.
    function renounceGovernance() external pure {
        revert GovernanceCannotBeRenounced();
    }

    // ----------------------------------------------------------------- minting

    /**
     * @notice Mint a master. Callable only by the controller, which is responsible for
     *         proving the artist consented — directly as msg.sender, or by signature.
     * @dev The registry does not verify authorship. It records what the controller
     *      asserts, and the controller is the module that can be replaced if its
     *      authorisation rules turn out to be wrong.
     */
    function mintMaster(
        address artist,
        uint256 artistFid,
        string calldata uri,
        uint32 maxCollectorEditions,
        address referrer,
        uint96 royaltyBps,
        uint8 nftType
    ) external onlyController nonReentrant returns (uint256 masterTokenId) {
        if (artist == address(0)) revert ZeroAddress();
        if (artistFid == 0) revert FidRequired();
        if (maxCollectorEditions > MAX_COLLECTOR_EDITIONS) {
            revert InvalidEditionCount(maxCollectorEditions, MAX_COLLECTOR_EDITIONS);
        }
        if (royaltyBps > HARD_MAX_ROYALTY_BPS) {
            revert RoyaltyTooHigh(royaltyBps, HARD_MAX_ROYALTY_BPS);
        }

        unchecked {
            masterTokenId = ++_masterCounter;
        }

        _masters[masterTokenId] = Master({
            artist: artist,
            artistFid: artistFid,
            createdAt: uint64(block.timestamp),
            maxCollectorEditions: maxCollectorEditions,
            collectorsMinted: 0,
            referrer: referrer == artist ? address(0) : referrer,
            royaltyShareBps: 0,
            royaltyShareSink: address(0)
        });

        // State is complete before the external call. `_safeMint` invokes
        // onERC721Received on the recipient, and in V2 that callback could observe a
        // minted token whose record had not been written yet.
        _safeMint(artist, masterTokenId);
        _setTokenURI(masterTokenId, uri);
        _setTokenRoyalty(masterTokenId, artist, royaltyBps);

        emit MasterMinted(masterTokenId, artist, artistFid, referrer, nftType);
    }

    /**
     * @notice Mint a licence against a master.
     * @dev The collector cap is enforced here, in the core, and incremented before the
     *      external call. In V2 the increment happened after the internal mint returned,
     *      so a reentrant path could exceed the cap if a guard were ever removed.
     */
    function mintLicense(
        uint256 masterTokenId,
        address to,
        bool isCollector,
        string calldata uri,
        uint96 royaltyBps
    ) external onlyController nonReentrant returns (uint256 licenseId) {
        Master storage master = _masters[masterTokenId];
        if (master.artist == address(0)) revert MasterNotFound(masterTokenId);
        if (to == address(0)) revert ZeroAddress();
        if (royaltyBps > HARD_MAX_ROYALTY_BPS) {
            revert RoyaltyTooHigh(royaltyBps, HARD_MAX_ROYALTY_BPS);
        }

        if (isCollector) {
            if (master.maxCollectorEditions == 0) {
                revert CollectorTierUnavailable(masterTokenId);
            }
            if (master.collectorsMinted >= master.maxCollectorEditions) {
                revert CollectorEditionsSoldOut(masterTokenId);
            }
            unchecked {
                master.collectorsMinted += 1;
            }
        }

        unchecked {
            licenseId = ++_licenseCounter;
        }

        _licenses[licenseId] = License({
            masterTokenId: masterTokenId,
            mintedAt: uint64(block.timestamp),
            isCollector: isCollector
        });

        _safeMint(to, licenseId);
        _setTokenURI(licenseId, uri);
        // Snapshotted per token: a later governance change to the default rate must not
        // alter the resale economics of a licence somebody already bought.
        _setTokenRoyalty(licenseId, master.artist, royaltyBps);

        emit LicenseMinted(licenseId, masterTokenId, to, isCollector);
    }

    // ------------------------------------------------------------ royalty share

    /**
     * @notice Bind a master to a Clearwave royalty offering. Write-once.
     * @dev Immutable after the first write because investors price their purchase on it.
     *      A mutable share, however well intentioned, lets whoever holds the key dilute
     *      shareholders after they have paid.
     */
    function setRoyaltyShare(uint256 masterTokenId, uint96 bps, address sink)
        external
        onlyController
    {
        Master storage master = _masters[masterTokenId];
        if (master.artist == address(0)) revert MasterNotFound(masterTokenId);
        if (master.royaltyShareSink != address(0)) {
            revert RoyaltyShareAlreadySet(masterTokenId);
        }
        if (sink == address(0)) revert ZeroAddress();
        if (bps > HARD_MAX_ROYALTY_BPS) revert RoyaltyTooHigh(bps, HARD_MAX_ROYALTY_BPS);

        master.royaltyShareBps = bps;
        master.royaltyShareSink = sink;
        emit RoyaltyShareSet(masterTokenId, bps, sink);
    }

    // ----------------------------------------------------------------- burning

    /**
     * @notice Burn a token.
     * @dev Requires owner or approval, always. In V2 `burnExpiredLicense` had no caller
     *      check at all, so any stranger could destroy an expired licence belonging to
     *      anyone — and every licence expired after thirty days.
     */
    function burn(uint256 tokenId) external nonReentrant {
        address owner = _requireOwned(tokenId);
        // `super` deliberately: the base rule, without the controller's implicit operator
        // grant. A settlement module needs to move a licence, never to destroy one, and a
        // controller that could burn could erase a holding it was only meant to transfer.
        // An explicitly approved controller still passes, because that is the owner's call.
        if (!super._isAuthorized(owner, msg.sender, tokenId)) revert NotOwnerNorApproved();

        if (isLicense(tokenId)) {
            delete _licenses[tokenId];
        } else {
            delete _masters[tokenId];
        }

        _resetTokenRoyalty(tokenId);
        _burn(tokenId);
        emit TokenBurned(tokenId, owner);
    }

    // ------------------------------------------------------------------- views

    function isLicense(uint256 tokenId) public pure returns (bool) {
        return tokenId > LICENSE_ID_OFFSET;
    }

    function getMaster(uint256 masterTokenId) external view returns (Master memory) {
        return _masters[masterTokenId];
    }

    function getLicense(uint256 licenseId) external view returns (License memory) {
        return _licenses[licenseId];
    }

    function masterExists(uint256 masterTokenId) external view returns (bool) {
        return _masters[masterTokenId].artist != address(0);
    }

    function totalMasters() external view returns (uint256) {
        return _masterCounter;
    }

    function totalLicenses() external view returns (uint256) {
        return _licenseCounter - LICENSE_ID_OFFSET;
    }

    // --------------------------------------------------------------- overrides

    /**
     * @dev Masters are soulbound: mintable and burnable, never transferable. Licences
     *      transfer freely — that is what makes resale work, and it is unrelated to any
     *      access rule.
     */
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        if (!isLicense(tokenId) && from != address(0) && to != address(0)) {
            revert MastersAreSoulbound();
        }
        return super._update(to, tokenId, auth);
    }

    /**
     * @dev The controller is an implicit operator for licences, so a signed resale settles
     *      in one transaction. The alternative — making every seller send `setApprovalForAll`
     *      before listing — turns a signature into a transaction and defeats the point of
     *      signing an order at all.
     *
     *      Scoped deliberately, and narrower than a blanket `isApprovedForAll` override:
     *        - licences only. `isLicense` excludes masters, so authorship is never reachable
     *          this way even if the soulbound rule in `_update` were ever relaxed.
     *        - transfers only. {burn} calls `super._isAuthorized`, which ignores this grant.
     *        - one address, revocable. Governance points {controller} at the current module;
     *          a replaced controller loses the power in the same transaction.
     *
     *      What this concedes: whoever controls the controller can move any licence. That is
     *      already true of a module that mints them, and it is why {setController} is
     *      governance-only and why policy lives in a contract that can be replaced.
     */
    function _isAuthorized(address owner, address spender, uint256 tokenId)
        internal
        view
        override
        returns (bool)
    {
        if (spender != address(0) && spender == controller && isLicense(tokenId)) {
            return true;
        }
        return super._isAuthorized(owner, spender, tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721URIStorage, ERC2981)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
