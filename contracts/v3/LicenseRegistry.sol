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
 *   - Ownership is the single source of truth for who holds a licence. The one derived
 *     index — {licensesHeld} — is maintained inside the transfer hook, so it cannot fall
 *     out of sync the way V2's append-only `userLicenses` array did.
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
        uint256 artistFid; // optional; 0 = no Farcaster account. See docs/DEPLOYMENT_PLAN.md
        uint64 createdAt;
        uint32 maxCollectorEditions; // 0 = no collector tier for this master
        uint32 collectorsMinted;
        uint8 nftType; // 0 = MUSIC, 1 = ART. Packs free into this slot.
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

    /// @dev How many masters an artist currently holds. Maintained here rather than derived,
    ///      because the only alternative is an unbounded scan. Decremented on burn so it stays
    ///      a count of live masters, not of masters ever minted.
    mapping(address => uint256) private _artistMasterCount;
    mapping(uint256 => License) private _licenses;

    /**
     * @dev How many licences `owner` holds for a given master. Maintained in {_update}, so it
     *      is correct across mint, transfer and burn by construction.
     *
     *      This is deliberately a count, not the `userLicenses` array V2 kept. That array was
     *      append-only and never touched on transfer, which is the direct cause of V2's H1:
     *      after a resale the seller still passed the licence check and the buyer still failed.
     *      A counter updated in the transfer hook cannot drift the same way, and answers in
     *      O(1) rather than scanning — so it also avoids V2's M3 unbounded loop.
     */
    mapping(address => mapping(uint256 => uint32)) private _licensesHeld;

    /**
     * @dev Masters withdrawn from circulation — infringement, impersonation, abuse.
     *
     *      Suspension is deliberately NOT a burn and NOT a seizure. It stops the master being
     *      sold and stops it being played; it does not touch a licence anyone already bought.
     *      A listener who paid for a copy did nothing wrong because the artist was later
     *      banned, so {hasValidLicense} keeps answering true for them.
     *
     *      It is also reversible, which a burn is not. Takedowns are made on incomplete
     *      information and get reversed; the destructive version cannot be.
     */
    mapping(uint256 => bool) public masterSuspended;
    mapping(uint256 => string) public masterSuspensionReason;

    /**
     * @dev Permanently removed — hate speech, harassment, and material that must never come
     *      back. One-way by construction: no function in this contract clears it.
     *
     *      Two-stage on purpose. A moderator {setMasterSuspended} takes the content dark in
     *      seconds; {purgeMaster} makes that permanent, and only governance can do it. The
     *      slower bar on the irreversible step costs nothing, because the reversible step has
     *      already stopped the harm.
     *
     *      What a purge can actually achieve on-chain is honest but bounded: the file itself
     *      lives on IPFS and no contract can erase it. What this DOES do is stop the registry
     *      pointing at it — {tokenURI} returns empty for a purged master and for every licence
     *      of one. Unpinning from IPFS is a separate, off-chain step and is still required.
     */
    mapping(uint256 => bool) public masterPurged;
    mapping(uint256 => string) public masterPurgeReason;

    /**
     * @dev Fast-acting moderation key. Abuse response cannot wait on a 48-hour timelock, so
     *      this role exists to act immediately — but ONLY on reversible things. Everything
     *      irreversible stays with {governance}. Set to address(0) to disable.
     */
    address public moderator;

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
    event ModeratorSet(address indexed moderator);
    event MasterSuspensionSet(uint256 indexed masterTokenId, bool suspended, string reason);
    event MasterPurged(uint256 indexed masterTokenId, address indexed artist, string reason);
    event GovernanceTransferStarted(address indexed from, address indexed to);
    event GovernanceTransferred(address indexed from, address indexed to);

    // ----------------------------------------------------------------- errors

    error NotController();
    error NotGovernance();
    error NotOwnerNorApproved();
    error ZeroAddress();
    error MasterNotFound(uint256 masterTokenId);
    error CollectorTierUnavailable(uint256 masterTokenId);
    error CollectorEditionsSoldOut(uint256 masterTokenId);
    error InvalidEditionCount(uint32 requested, uint32 max);
    error RoyaltyTooHigh(uint96 bps, uint96 max);
    error RoyaltyShareAlreadySet(uint256 masterTokenId);
    error MastersAreSoulbound();
    error GovernanceCannotBeRenounced();
    error NotPendingGovernance();
    error NotModerator();
    error MasterIsSuspended(uint256 masterTokenId);
    error MasterIsPurged(uint256 masterTokenId);

    // -------------------------------------------------------------- modifiers

    modifier onlyController() {
        if (msg.sender != controller) revert NotController();
        _;
    }

    modifier onlyGovernance() {
        if (msg.sender != governance) revert NotGovernance();
        _;
    }

    /// @dev Governance can always moderate; the moderator key is an additional fast path.
    modifier onlyModerator() {
        if (msg.sender != moderator && msg.sender != governance) revert NotModerator();
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

    // ----------------------------------------------------------- moderation

    /// @notice Appoint (or, with address(0), remove) the fast-acting moderation key.
    function setModerator(address newModerator) external onlyGovernance {
        moderator = newModerator;
        emit ModeratorSet(newModerator);
    }

    /**
     * @notice Withdraw a master from circulation, or restore it.
     * @dev Suspension stops new licences being minted and makes {masterTokens} report the
     *      master inactive, which is what stops LiveRadioV3 queueing it. It deliberately does
     *      NOT:
     *        - burn anything. Takedowns get reversed; burns cannot be.
     *        - affect existing licence holders. {hasValidLicense} still answers true for a
     *          buyer who already paid. Their copy is their property, not leverage over the
     *          artist.
     *        - touch payouts. Money already earned is settled in the subscription contract,
     *          and is not reachable from here by design.
     *
     *      `reason` is recorded on-chain so a takedown always carries a stated cause.
     */
    function setMasterSuspended(uint256 masterTokenId, bool suspended, string calldata reason)
        external
        onlyModerator
    {
        if (_masters[masterTokenId].artist == address(0)) revert MasterNotFound(masterTokenId);
        // A purge is final. Nothing, including governance, restores a purged master.
        if (masterPurged[masterTokenId]) revert MasterIsPurged(masterTokenId);
        masterSuspended[masterTokenId] = suspended;
        if (suspended) {
            masterSuspensionReason[masterTokenId] = reason;
        } else {
            delete masterSuspensionReason[masterTokenId];
        }
        emit MasterSuspensionSet(masterTokenId, suspended, reason);
    }

    /**
     * @notice Permanently remove a master. Governance only, and there is no way back.
     * @dev For material that must never be restored — hate speech, harassment, content that
     *      is illegal to host. Ordinary infringement is {setMasterSuspended}, which is
     *      reversible; reach for this only when restoration would itself be the harm.
     *
     *      Deliberately governance-gated rather than moderator-gated. When {governance}
     *      becomes the Timelock, this inherits its delay automatically — and that delay costs
     *      nothing, because a moderator can already have suspended the master in seconds.
     *      Suspend first, purge second.
     *
     *      Irreversible by construction: no function clears {masterPurged}. That is the point.
     *      A restore path is a path an attacker with the governance key can walk.
     *
     *      It does NOT burn, and it does NOT seize licences. Holders keep their tokens for the
     *      same reason as under suspension — property is not leverage. What they lose is the
     *      content pointer: {tokenURI} returns empty for the master and for every licence of
     *      it, so the registry stops serving the material. Unpin from IPFS separately.
     */
    function purgeMaster(uint256 masterTokenId, string calldata reason) external onlyGovernance {
        address artist = _masters[masterTokenId].artist;
        if (artist == address(0)) revert MasterNotFound(masterTokenId);
        if (masterPurged[masterTokenId]) revert MasterIsPurged(masterTokenId);

        masterPurged[masterTokenId] = true;
        masterPurgeReason[masterTokenId] = reason;
        masterSuspended[masterTokenId] = true;
        masterSuspensionReason[masterTokenId] = reason;

        emit MasterPurged(masterTokenId, artist, reason);
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
        // artistFid is optional: 0 means "no Farcaster account". The artist address is the
        // identity — masters, plays and payouts are all keyed by it — and the FID is only a
        // secondary index for Farcaster lookups. Requiring it would have limited the artist
        // roster to musicians who happen to be on Farcaster, which is the binding constraint
        // on this product. See docs/DEPLOYMENT_PLAN.md "Identity".
        if (maxCollectorEditions > MAX_COLLECTOR_EDITIONS) {
            revert InvalidEditionCount(maxCollectorEditions, MAX_COLLECTOR_EDITIONS);
        }
        if (royaltyBps > HARD_MAX_ROYALTY_BPS) {
            revert RoyaltyTooHigh(royaltyBps, HARD_MAX_ROYALTY_BPS);
        }

        unchecked {
            masterTokenId = ++_masterCounter;
            _artistMasterCount[artist] += 1;
        }

        _masters[masterTokenId] = Master({
            artist: artist,
            artistFid: artistFid,
            createdAt: uint64(block.timestamp),
            maxCollectorEditions: maxCollectorEditions,
            collectorsMinted: 0,
            nftType: nftType,
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
        if (masterSuspended[masterTokenId]) revert MasterIsSuspended(masterTokenId);
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

        _resetTokenRoyalty(tokenId);

        // Burn before clearing the record. {_update} reads `_licenses[tokenId].masterTokenId`
        // to decrement the holder's licence count, so the record must still be readable when
        // the hook runs — deleting first would decrement master 0 and leave the real count
        // standing, keeping {hasValidLicense} true for a licence that no longer exists.
        // Safe to defer: ERC-721 burns invoke no receiver callback, and this is nonReentrant.
        _burn(tokenId);

        if (isLicense(tokenId)) {
            delete _licenses[tokenId];
        } else {
            // Burning a master reduces the artist's live master count. Left unadjusted, a
            // burn-and-remint loop would inflate the count that gates TOURS eligibility.
            unchecked {
                _artistMasterCount[owner] -= 1;
            }
            delete _masters[tokenId];
        }

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

    /**
     * @notice Classification of a master: 0 = MUSIC, 1 = ART.
     * @dev Exists so the subscription contract can refuse to pay streaming revenue against a
     *      master that is not music. V2 exposed this as `getMasterType`; the name and the
     *      `uint8` return are kept so the subscription interface is unchanged.
     */
    function getMasterType(uint256 masterTokenId) external view returns (uint8) {
        if (_masters[masterTokenId].artist == address(0)) revert MasterNotFound(masterTokenId);
        return _masters[masterTokenId].nftType;
    }

    /**
     * @notice How many live masters `artist` holds.
     * @dev The deployed NFT V2 never implemented this, which is why
     *      `MusicSubscriptionV5.isArtistEligible` reverts with empty data rather than merely
     *      returning false — see INTEGRATION_MATRIX.md BREAK 1. Implementing it here is what
     *      closes that break.
     */
    function artistMasterCount(address artist) external view returns (uint256) {
        return _artistMasterCount[artist];
    }

    function totalMasters() external view returns (uint256) {
        return _masterCounter;
    }

    function totalLicenses() external view returns (uint256) {
        return _licenseCounter - LICENSE_ID_OFFSET;
    }

    /// @notice How many licences `owner` holds for `masterTokenId`.
    function licensesHeld(address owner, uint256 masterTokenId) external view returns (uint32) {
        return _licensesHeld[owner][masterTokenId];
    }

    // ------------------------------------------------------- LiveRadioV3 compatibility
    //
    // LiveRadioV3 (0x042EDF80713e6822a891e4e8a0800c332B8200fd) is live, working, and calls the
    // NFT contract through its own `IEmpowerToursNFT` interface. It is repointed at this
    // registry at cutover via `setNFTContract` (onlyOwner). Without the two functions below it
    // would revert on every queue request — see docs/INTEGRATION_MATRIX.md, BREAK 3.
    //
    // These exist solely to keep a deployed contract working. Nothing new should call them:
    // use {licensesHeld} and {getMaster} instead.

    /**
     * @notice Does `user` hold a licence for `masterTokenId`?
     * @dev Consumed by LiveRadioV3 to decide whether a queue request is free or costs
     *      QUEUE_PRICE_NO_LICENSE. Correct across resales, unlike V2's equivalent (H1).
     */
    function hasValidLicense(address user, uint256 masterTokenId) external view returns (bool) {
        return _licensesHeld[user][masterTokenId] > 0;
    }

    /**
     * @notice V2-shaped view of a master, for LiveRadioV3 only.
     * @dev The tuple's arity, order and types must match V2's `masterTokens` exactly or the
     *      caller's abi.decode reverts. LiveRadioV3 reads only `originalArtist` and `active`
     *      (it destructures `artistFid` but never uses it).
     *
     *      Fields v3 does not hold are returned zero/empty, NOT reconstructed:
     *        - price, collectorPrice ...... pricing lives in SalesController, not the registry
     *        - collectorTokenURI .......... v3 keeps one URI per token
     *        - totalSold, activeLicenses .. never tracked here
     *        - nftType .................... reported truthfully; see {getMasterType}
     *        - royaltyPercentage .......... per-token, held by ERC2981; read royaltyInfo instead
     *
     *      Do not add a consumer that depends on a zeroed field.
     */
    function masterTokens(uint256 masterTokenId)
        external
        view
        returns (
            uint256 artistFid,
            address originalArtist,
            string memory uri,
            string memory collectorUri,
            uint256 price,
            uint256 collectorPrice,
            uint256 totalSold,
            uint256 activeLicenses,
            uint256 maxCollectorEditions,
            uint256 collectorsMinted,
            bool active,
            uint8 nftType,
            uint96 royaltyPercentage
        )
    {
        Master storage m = _masters[masterTokenId];
        // A suspended master reports inactive, which is what stops LiveRadioV3 queueing it
        // (`require(active, "Song not active")`). Existing licence holders are unaffected —
        // see {hasValidLicense}.
        active = m.artist != address(0) && !masterSuspended[masterTokenId];
        return (
            m.artistFid,
            m.artist,
            active ? tokenURI(masterTokenId) : "",
            "",
            0,
            0,
            0,
            0,
            m.maxCollectorEditions,
            m.collectorsMinted,
            active,
            m.nftType,
            0
        );
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

        address previousOwner = super._update(to, tokenId, auth);

        // Keep the per-master licence count in step with ownership. Safe on mint because
        // {mintLicense} writes `_licenses[licenseId]` before `_safeMint`, so the master id is
        // already readable here.
        if (isLicense(tokenId)) {
            uint256 masterTokenId = _licenses[tokenId].masterTokenId;
            if (from != address(0)) {
                unchecked {
                    _licensesHeld[from][masterTokenId] -= 1;
                }
            }
            if (to != address(0)) {
                unchecked {
                    _licensesHeld[to][masterTokenId] += 1;
                }
            }
        }

        return previousOwner;
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

    /**
     * @dev A purged master serves no content pointer, and neither does any licence of it.
     *      Covering licences here rather than clearing each one avoids enumerating an
     *      unbounded set — the check is O(1) and cannot miss a token.
     *
     *      This does not erase the file. IPFS is content-addressed and no contract reaches
     *      it; what this removes is the registry's reference to it. Unpinning is off-chain.
     */
    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721URIStorage)
        returns (string memory)
    {
        uint256 masterTokenId = isLicense(tokenId) ? _licenses[tokenId].masterTokenId : tokenId;
        if (masterPurged[masterTokenId]) {
            _requireOwned(tokenId);
            return "";
        }
        return super.tokenURI(tokenId);
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
