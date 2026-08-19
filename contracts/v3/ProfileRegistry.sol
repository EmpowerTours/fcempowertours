// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/**
 * @title ProfileRegistry
 * @notice Display names for people who have no Farcaster account.
 * @author EmpowerTours
 *
 * @dev Today the app resolves an artist's name by asking Neynar to map their address to a
 *      Farcaster username. A wallet-only artist has no such mapping, so they render as
 *      `0x1a2b…f9c0` — on their own track page, in the radio, and in the catalogue the Go API
 *      serves. This contract is the fallback for exactly that case.
 *
 * ## What a display name is, and what it is not
 *
 * **The address is the identity. A display name is a label on top of it, and nothing more.**
 * That is the same rule the rest of this deployment follows, and it is what decides every
 * question below.
 *
 * A name here is **not** a Farcaster username, does not claim to be one, and is never resolved
 * as one. When someone has a Farcaster account, that name should win — this registry is the
 * fallback, and the resolution order belongs in the app:
 *
 * ```
 * Farcaster username (via Neynar)  →  ProfileRegistry name  →  shortened address
 * ```
 *
 * ## Uniqueness, and what it can honestly promise
 *
 * Names are unique first-come, case-insensitively across ASCII. Without that, a name identifies
 * nobody and is not worth storing. Releasing a name frees it immediately for anyone else.
 *
 * What uniqueness cannot promise is that a name is not *confusable* with another. `Unify34` and
 * `Unifу34` (Cyrillic у) are different byte strings and both can be registered. Normalising
 * Unicode on-chain is not practical, and a restricted ASCII charset would exclude the accented
 * names a Spanish-speaking roster actually uses — so the check that would have to be perfect is
 * deliberately not attempted here. Two things carry that weight instead: {clearProfile}, so an
 * impersonating name can be taken down, and the app, which should always render the address
 * alongside the name rather than letting a name stand alone as proof of who someone is.
 *
 * ## Moderation
 *
 * `governance` can clear a profile. That is the whole of it — clearing frees the name and wipes
 * the metadata, the account is untouched, and the owner may register again. Nothing here can
 * reach a master, a licence, or a payout, and it deliberately has no ability to *set* someone
 * else's name: taking a name down is a moderation act, putting words in someone's mouth is not.
 */
contract ProfileRegistry {
    // ------------------------------------------------------------------ types

    struct Profile {
        string displayName;
        string avatarURI;
        string bio;
        uint64 updatedAt;
    }

    // ------------------------------------------------------------------ state

    mapping(address => Profile) private _profiles;

    /// @dev Case-folded name → owner. The uniqueness index; see {_foldKey}.
    mapping(bytes32 => address) private _nameOwner;

    address public governance;
    address public pendingGovernance;

    // ------------------------------------------------------------- parameters

    uint256 public constant MAX_NAME_BYTES = 32;
    uint256 public constant MAX_AVATAR_BYTES = 256;
    uint256 public constant MAX_BIO_BYTES = 512;

    // ----------------------------------------------------------------- events

    event ProfileSet(address indexed owner, string displayName);
    event ProfileCleared(address indexed owner, address indexed by, string reason);
    event GovernanceTransferStarted(address indexed from, address indexed to);
    event GovernanceTransferred(address indexed from, address indexed to);

    // ----------------------------------------------------------------- errors

    error NotGovernance();
    error NotPendingGovernance();
    error ZeroAddress();
    error NameTaken(string displayName, address owner);
    error NameEmpty();
    error NameTooLong(uint256 length, uint256 max);
    error NameHasControlCharacters();
    error NameHasEdgeWhitespace();
    error AvatarTooLong(uint256 length, uint256 max);
    error BioTooLong(uint256 length, uint256 max);
    error NoProfile(address owner);
    error GovernanceCannotBeRenounced();

    // -------------------------------------------------------------- modifiers

    modifier onlyGovernance() {
        if (msg.sender != governance) revert NotGovernance();
        _;
    }

    constructor(address initialGovernance) {
        if (initialGovernance == address(0)) revert ZeroAddress();
        governance = initialGovernance;
    }

    // ------------------------------------------------------------ registering

    /**
     * @notice Set or update your own profile. Only ever your own — there is no `setProfileFor`.
     * @dev Re-registering the name you already hold is allowed, so you can change your avatar
     *      or bio without giving up your name and racing someone else for it.
     * @param displayName 1-32 bytes, no control characters, no leading or trailing space.
     * @param avatarURI Optional image pointer. Not validated beyond a length cap — the app must
     *        treat it as untrusted and refuse anything that is not an expected scheme.
     * @param bio Optional free text.
     */
    function setProfile(string calldata displayName, string calldata avatarURI, string calldata bio)
        external
    {
        bytes calldata nameBytes = bytes(displayName);
        _validateName(nameBytes);

        if (bytes(avatarURI).length > MAX_AVATAR_BYTES) {
            revert AvatarTooLong(bytes(avatarURI).length, MAX_AVATAR_BYTES);
        }
        if (bytes(bio).length > MAX_BIO_BYTES) {
            revert BioTooLong(bytes(bio).length, MAX_BIO_BYTES);
        }

        bytes32 newKey = _foldKey(nameBytes);
        address currentOwner = _nameOwner[newKey];
        if (currentOwner != address(0) && currentOwner != msg.sender) {
            revert NameTaken(displayName, currentOwner);
        }

        // Release the caller's previous name before claiming the new one, so a rename frees the
        // old name in the same transaction rather than leaving it parked forever.
        bytes memory previous = bytes(_profiles[msg.sender].displayName);
        if (previous.length != 0) {
            bytes32 previousKey = _foldKeyMemory(previous);
            if (previousKey != newKey) delete _nameOwner[previousKey];
        }

        _nameOwner[newKey] = msg.sender;
        _profiles[msg.sender] = Profile({
            displayName: displayName,
            avatarURI: avatarURI,
            bio: bio,
            updatedAt: uint64(block.timestamp)
        });

        emit ProfileSet(msg.sender, displayName);
    }

    /// @notice Give up your profile and free your name.
    function clearOwnProfile() external {
        _clear(msg.sender, msg.sender, "owner cleared");
    }

    /**
     * @notice Governance takedown — impersonation, abuse, a name someone should not be using.
     * @dev Frees the name and wipes the metadata. It does not ban the address, and it cannot
     *      set a replacement name: removing a label is moderation, writing one is not.
     */
    function clearProfile(address owner, string calldata reason) external onlyGovernance {
        _clear(owner, msg.sender, reason);
    }

    function _clear(address owner, address by, string memory reason) private {
        bytes memory name = bytes(_profiles[owner].displayName);
        if (name.length == 0) revert NoProfile(owner);

        delete _nameOwner[_foldKeyMemory(name)];
        delete _profiles[owner];

        emit ProfileCleared(owner, by, reason);
    }

    // ------------------------------------------------------------------ views

    function getProfile(address owner) external view returns (Profile memory) {
        return _profiles[owner];
    }

    /// @notice The display name for `owner`, or an empty string if they have not set one.
    function displayNameOf(address owner) external view returns (string memory) {
        return _profiles[owner].displayName;
    }

    /// @notice Who holds `displayName`, or the zero address if nobody does.
    function ownerOfName(string calldata displayName) external view returns (address) {
        return _nameOwner[_foldKey(bytes(displayName))];
    }

    function isNameAvailable(string calldata displayName) external view returns (bool) {
        return _nameOwner[_foldKey(bytes(displayName))] == address(0);
    }

    // ------------------------------------------------------------- validation

    /**
     * @dev Rejects the cases that make a name unusable or actively deceptive at display time:
     *      empty, over-long, control characters (which can hide or reorder text in a UI), and
     *      leading or trailing spaces (which make two visually identical names distinct).
     *
     *      Byte values above 0x7F pass through untouched. That admits accented Latin, which the
     *      roster needs, and with it the homoglyph problem documented at the top of this file.
     */
    function _validateName(bytes calldata name) private pure {
        uint256 len = name.length;
        if (len == 0) revert NameEmpty();
        if (len > MAX_NAME_BYTES) revert NameTooLong(len, MAX_NAME_BYTES);
        if (name[0] == 0x20 || name[len - 1] == 0x20) revert NameHasEdgeWhitespace();

        for (uint256 i = 0; i < len; i++) {
            uint8 c = uint8(name[i]);
            // C0 controls and DEL. Anything >= 0x80 is a UTF-8 continuation or lead byte and is
            // left alone; C1 controls are unreachable as bare bytes in valid UTF-8.
            if (c < 0x20 || c == 0x7F) revert NameHasControlCharacters();
        }
    }

    /**
     * @dev Uniqueness key: ASCII-lowercased, so `Unify34` and `unify34` are the same name and
     *      cannot both be claimed. Non-ASCII bytes are hashed as-is.
     */
    function _foldKey(bytes calldata name) private pure returns (bytes32) {
        return _foldKeyMemory(bytes(name));
    }

    function _foldKeyMemory(bytes memory name) private pure returns (bytes32) {
        bytes memory folded = new bytes(name.length);
        for (uint256 i = 0; i < name.length; i++) {
            uint8 c = uint8(name[i]);
            folded[i] = (c >= 0x41 && c <= 0x5A) ? bytes1(c + 32) : name[i];
        }
        return keccak256(folded);
    }

    // ------------------------------------------------------------- governance

    /// @dev Two-step, same as LicenseRegistry: a typo in the address cannot orphan the role.
    function transferGovernance(address newGovernance) external onlyGovernance {
        if (newGovernance == address(0)) revert ZeroAddress();
        pendingGovernance = newGovernance;
        emit GovernanceTransferStarted(governance, newGovernance);
    }

    function acceptGovernance() external {
        if (msg.sender != pendingGovernance) revert NotPendingGovernance();
        address previous = governance;
        governance = msg.sender;
        delete pendingGovernance;
        emit GovernanceTransferred(previous, msg.sender);
    }

    /// @notice Disabled. An ungoverned registry can never take down an impersonating name.
    function renounceGovernance() external pure {
        revert GovernanceCannotBeRenounced();
    }
}
