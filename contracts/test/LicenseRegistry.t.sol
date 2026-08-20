// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import "../v3/LicenseRegistry.sol";

/// @dev Reentrancy probe: attempts to re-enter on the ERC-721 receive callback.
contract ReenteringReceiver {
    LicenseRegistry public reg;
    uint256 public masterId;
    bool public armed;

    constructor(LicenseRegistry r) {
        reg = r;
    }

    function arm(uint256 m) external {
        masterId = m;
        armed = true;
    }

    function onERC721Received(address, address, uint256, bytes calldata)
        external
        returns (bytes4)
    {
        if (armed) {
            armed = false;
            // Must fail: this contract is not the controller, and the guard is active.
            try reg.mintLicense(masterId, address(this), true, "u", 500) {
                revert("reentrancy succeeded");
            } catch {}
        }
        return this.onERC721Received.selector;
    }
}

contract LicenseRegistryTest is Test {
    LicenseRegistry reg;

    address governance = makeAddr("governance");
    address controller = makeAddr("controller");
    address artist = makeAddr("artist");
    address buyer = makeAddr("buyer");
    address stranger = makeAddr("stranger");
    address referrer = makeAddr("referrer");

    /// @dev V3 requires a nonzero artist FID. Farcaster identity is the primary key.
    uint256 constant FID = 868469;

    function setUp() public {
        reg = new LicenseRegistry(governance);
        vm.prank(governance);
        reg.setController(controller);
    }

    function _mintMaster(uint32 editions) internal returns (uint256) {
        vm.prank(controller);
        return reg.mintMaster(artist, FID, "ipfs://m", editions, referrer, 5000, 0);
    }

    // ------------------------------------------------------- legacy migration

    /**
     * @dev The V2 NFT stays deployed, so repointing the app here does not carry anything across.
     *      Exactly one licence outside the team is affected. This is the path that keeps it.
     */
    function test_GovernanceCanReissueALegacyLicence() public {
        uint256 m = _mintMaster(0);
        // A literal, not `block.timestamp - 90 days`: this suite runs at timestamp 1, where
        // that subtraction underflows. The value only has to be a plausible past purchase.
        uint64 boughtAt = 1_700_000_000;

        vm.prank(governance);
        uint256 licenseId = reg.migrateLegacy(buyer, m, boughtAt, false, "ipfs://legacy", 500);

        assertEq(reg.ownerOf(licenseId), buyer, "the buyer holds what they paid for");
        assertTrue(reg.hasValidLicense(buyer, m), "and the radio sees it");
        assertEq(reg.getLicense(licenseId).mintedAt, boughtAt, "the original purchase date is kept");
        assertEq(reg.getLicense(licenseId).masterTokenId, m);
    }

    function test_OnlyGovernanceCanMigrate() public {
        uint256 m = _mintMaster(0);

        vm.prank(stranger);
        vm.expectRevert(LicenseRegistry.NotGovernance.selector);
        reg.migrateLegacy(buyer, m, 1, false, "u", 500);

        // Not even the controller, which is the only thing that may normally mint.
        vm.prank(controller);
        vm.expectRevert(LicenseRegistry.NotGovernance.selector);
        reg.migrateLegacy(buyer, m, 1, false, "u", 500);
    }

    /// @dev It is a mint that bypasses payment, so it must not outlive the migration.
    function test_SealingMigrationIsPermanent() public {
        uint256 m = _mintMaster(0);

        vm.prank(governance);
        reg.sealMigration();
        assertTrue(reg.migrationSealed());

        vm.prank(governance);
        vm.expectRevert(LicenseRegistry.MigrationSealed.selector);
        reg.migrateLegacy(buyer, m, 1, false, "u", 500);

        // And there is no way back: sealing again changes nothing, and no unseal exists.
        vm.prank(governance);
        reg.sealMigration();
        vm.prank(governance);
        vm.expectRevert(LicenseRegistry.MigrationSealed.selector);
        reg.migrateLegacy(buyer, m, 1, false, "u", 500);
    }

    function test_MigrationRejectsNonsense() public {
        uint256 m = _mintMaster(0);

        vm.startPrank(governance);
        vm.expectRevert(LicenseRegistry.ZeroAddress.selector);
        reg.migrateLegacy(address(0), m, 1, false, "u", 500);

        vm.expectRevert(LicenseRegistry.InvalidMintedAt.selector);
        reg.migrateLegacy(buyer, m, 0, false, "u", 500);

        vm.expectRevert(abi.encodeWithSelector(LicenseRegistry.MasterNotFound.selector, uint256(999)));
        reg.migrateLegacy(buyer, 999, 1, false, "u", 500);
        vm.stopPrank();
    }

    /**
     * @dev The collector cap is a promise to buyers about scarcity. A migration is not a reason
     *      to break it, so a migrated collector edition still counts against the cap.
     */
    function test_MigrationRespectsTheCollectorCap() public {
        uint256 m = _mintMaster(1);

        vm.prank(governance);
        reg.migrateLegacy(buyer, m, 1, true, "u", 500);

        vm.prank(governance);
        vm.expectRevert(abi.encodeWithSelector(LicenseRegistry.CollectorEditionsSoldOut.selector, m));
        reg.migrateLegacy(stranger, m, 1, true, "u", 500);
    }

    function test_MigratedLicencesShareTheNormalIdSpace() public {
        uint256 m = _mintMaster(0);

        vm.prank(controller);
        uint256 normal = reg.mintLicense(m, buyer, false, "u", 500);

        vm.prank(governance);
        uint256 migrated = reg.migrateLegacy(stranger, m, 1, false, "u", 500);

        assertGt(migrated, normal, "ids keep counting up, no separate range to collide later");
        assertTrue(reg.isLicense(migrated));
        assertEq(reg.totalLicenses(), 2);
    }

    // ------------------------------------------------------------ minting auth

    function test_OnlyControllerCanMintMaster() public {
        vm.prank(stranger);
        vm.expectRevert(LicenseRegistry.NotController.selector);
        reg.mintMaster(artist, FID, "u", 0, address(0), 500, 0);
    }

    function test_OnlyControllerCanMintLicense() public {
        uint256 m = _mintMaster(0);
        vm.prank(stranger);
        vm.expectRevert(LicenseRegistry.NotController.selector);
        reg.mintLicense(m, buyer, false, "u", 500);
    }

    /**
     * @dev The artist ADDRESS is the identity. `artistFid` is an optional secondary index for
     *      Farcaster lookups, and 0 means "no Farcaster account". Requiring it would have
     *      limited the roster to musicians already on Farcaster — the binding constraint on
     *      this product — while guaranteeing nothing, since the contract cannot verify that a
     *      FID exists or belongs to the caller. See docs/DEPLOYMENT_PLAN.md "Identity".
     */
    function test_WalletOnlyArtistCanMintWithoutAFid() public {
        vm.prank(controller);
        uint256 m = reg.mintMaster(artist, 0, "u", 0, address(0), 500, 0);

        assertEq(reg.getMaster(m).artist, artist, "address is the identity");
        assertEq(reg.getMaster(m).artistFid, 0);
        assertTrue(reg.masterExists(m));
    }

    /// @dev A wallet-only master must be fully usable, not merely mintable.
    function test_WalletOnlyMasterSupportsLicensingAndRadio() public {
        vm.prank(controller);
        uint256 m = reg.mintMaster(artist, 0, "u", 0, address(0), 500, 0);

        vm.prank(controller);
        reg.mintLicense(m, buyer, false, "u", 500);
        assertTrue(reg.hasValidLicense(buyer, m));

        (uint256 fid, address originalArtist, , , , , , , , , bool active, , ) =
            reg.masterTokens(m);
        assertEq(fid, 0);
        assertEq(originalArtist, artist);
        assertTrue(active, "LiveRadioV3 must still accept a wallet-only artist's master");
    }

    function test_FidIsRecordedOnTheMaster() public {
        uint256 m = _mintMaster(0);
        assertEq(reg.getMaster(m).artistFid, FID);
        assertEq(reg.getMaster(m).artist, artist);
    }

    function test_SelfReferralIsDiscarded() public {
        vm.prank(controller);
        uint256 m = reg.mintMaster(artist, FID, "u", 0, artist, 500, 0);
        assertEq(reg.getMaster(m).referrer, address(0), "self-referral must not stick");
    }

    // ------------------------------------------------------------- H2 regression

    function test_StrangerCannotBurnSomeoneElsesLicense() public {
        uint256 m = _mintMaster(0);
        vm.prank(controller);
        uint256 lic = reg.mintLicense(m, buyer, false, "u", 500);

        vm.prank(stranger);
        vm.expectRevert(LicenseRegistry.NotOwnerNorApproved.selector);
        reg.burn(lic);

        assertEq(reg.ownerOf(lic), buyer, "licence must survive");
    }

    function test_OwnerCanBurnOwnLicense() public {
        uint256 m = _mintMaster(0);
        vm.prank(controller);
        uint256 lic = reg.mintLicense(m, buyer, false, "u", 500);

        vm.prank(buyer);
        reg.burn(lic);
        vm.expectRevert();
        reg.ownerOf(lic);
    }

    function test_ApprovedOperatorCanBurn() public {
        uint256 m = _mintMaster(0);
        vm.prank(controller);
        uint256 lic = reg.mintLicense(m, buyer, false, "u", 500);

        vm.prank(buyer);
        reg.approve(stranger, lic);
        vm.prank(stranger);
        reg.burn(lic);
        vm.expectRevert();
        reg.ownerOf(lic);
    }

    // ------------------------------------------- controller as implicit operator

    /**
     * @dev The controller settles signed resales, so it must be able to move a licence the
     *      seller never sent an approval transaction for. Without this, a signature-only
     *      listing needs a `setApprovalForAll` transaction first, which is the transaction
     *      the signature exists to avoid.
     */
    function test_ControllerCanTransferLicenseWithoutApproval() public {
        uint256 m = _mintMaster(0);
        vm.prank(controller);
        uint256 lic = reg.mintLicense(m, buyer, false, "u", 500);

        assertFalse(reg.isApprovedForAll(buyer, controller), "no explicit approval exists");

        vm.prank(controller);
        reg.transferFrom(buyer, stranger, lic);

        assertEq(reg.ownerOf(lic), stranger);
    }

    /// @dev Transfers only. A settlement module has no business destroying a holding.
    function test_ControllerCannotBurnALicense() public {
        uint256 m = _mintMaster(0);
        vm.prank(controller);
        uint256 lic = reg.mintLicense(m, buyer, false, "u", 500);

        vm.prank(controller);
        vm.expectRevert(LicenseRegistry.NotOwnerNorApproved.selector);
        reg.burn(lic);

        assertEq(reg.ownerOf(lic), buyer, "licence must survive");
    }

    /// @dev Licences only. The grant must never reach authorship.
    function test_ControllerCannotBurnAMaster() public {
        uint256 m = _mintMaster(0);

        vm.prank(controller);
        vm.expectRevert(LicenseRegistry.NotOwnerNorApproved.selector);
        reg.burn(m);

        assertEq(reg.ownerOf(m), artist);
    }

    /// @dev The soulbound rule is checked before authorisation, so it holds regardless.
    function test_ControllerCannotTransferAMaster() public {
        uint256 m = _mintMaster(0);

        vm.prank(controller);
        vm.expectRevert(LicenseRegistry.MastersAreSoulbound.selector);
        reg.transferFrom(artist, buyer, m);
    }

    /// @dev The grant follows the pointer. A replaced module loses it in the same tx.
    function test_ReplacedControllerLosesTheGrant() public {
        uint256 m = _mintMaster(0);
        vm.prank(controller);
        uint256 lic = reg.mintLicense(m, buyer, false, "u", 500);

        address newController = makeAddr("newController");
        vm.prank(governance);
        reg.setController(newController);

        vm.prank(controller);
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC721Errors.ERC721InsufficientApproval.selector, controller, lic
            )
        );
        reg.transferFrom(buyer, stranger, lic);

        vm.prank(newController);
        reg.transferFrom(buyer, stranger, lic);
        assertEq(reg.ownerOf(lic), stranger);
    }

    /// @dev The grant is one address wide, not "any contract that looks like a module".
    function test_StrangerStillCannotTransferSomeoneElsesLicense() public {
        uint256 m = _mintMaster(0);
        vm.prank(controller);
        uint256 lic = reg.mintLicense(m, buyer, false, "u", 500);

        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC721Errors.ERC721InsufficientApproval.selector, stranger, lic
            )
        );
        reg.transferFrom(buyer, stranger, lic);

        assertEq(reg.ownerOf(lic), buyer);
    }

    // ------------------------------------------------------- H1 regression

    /**
     * @dev V2 tracked licences in a `userLicenses` array appended only at mint, so after
     *      a resale the seller still passed an ownership check and the buyer failed one.
     *      Ownership here has exactly one source.
     */
    function test_OwnershipFollowsTransfer() public {
        uint256 m = _mintMaster(0);
        vm.prank(controller);
        uint256 lic = reg.mintLicense(m, buyer, false, "u", 500);

        vm.prank(buyer);
        reg.transferFrom(buyer, stranger, lic);

        assertEq(reg.ownerOf(lic), stranger, "buyer of the resale owns it");
        assertEq(reg.balanceOf(buyer), 0, "seller retains nothing");
    }

    // --------------------------------------------------------- soulbound masters

    function test_MasterCannotBeTransferred() public {
        uint256 m = _mintMaster(0);
        vm.prank(artist);
        vm.expectRevert(LicenseRegistry.MastersAreSoulbound.selector);
        reg.transferFrom(artist, buyer, m);
    }

    function test_MasterCanStillBeBurnedByArtist() public {
        uint256 m = _mintMaster(0);
        vm.prank(artist);
        reg.burn(m);
        assertFalse(reg.masterExists(m));
    }

    // ------------------------------------------------------------ collector caps

    function test_CollectorCapIsAbsolute() public {
        uint256 m = _mintMaster(2);
        vm.startPrank(controller);
        reg.mintLicense(m, buyer, true, "u", 500);
        reg.mintLicense(m, buyer, true, "u", 500);
        vm.expectRevert(
            abi.encodeWithSelector(LicenseRegistry.CollectorEditionsSoldOut.selector, m)
        );
        reg.mintLicense(m, buyer, true, "u", 500);
        vm.stopPrank();
        assertEq(reg.getMaster(m).collectorsMinted, 2);
    }

    function test_CollectorTierUnavailableWhenCapIsZero() public {
        uint256 m = _mintMaster(0);
        vm.prank(controller);
        vm.expectRevert(
            abi.encodeWithSelector(LicenseRegistry.CollectorTierUnavailable.selector, m)
        );
        reg.mintLicense(m, buyer, true, "u", 500);
    }

    function test_StandardLicensesAreUncapped() public {
        uint256 m = _mintMaster(0);
        vm.startPrank(controller);
        for (uint256 i; i < 25; ++i) {
            reg.mintLicense(m, buyer, false, "u", 500);
        }
        vm.stopPrank();
        assertEq(reg.totalLicenses(), 25);
    }

    // --------------------------------------------------------------- M2 regression

    /// @dev State must be complete before `_safeMint` hands control to the recipient.
    function test_ReentrancyOnReceiveCannotMint() public {
        ReenteringReceiver rc = new ReenteringReceiver(reg);
        uint256 m = _mintMaster(5);
        rc.arm(m);

        vm.prank(controller);
        reg.mintLicense(m, address(rc), true, "u", 500);

        assertEq(reg.getMaster(m).collectorsMinted, 1, "cap must count exactly one");
        assertEq(reg.totalLicenses(), 1);
    }

    // --------------------------------------------------------------- royalty share

    function test_RoyaltyShareIsWriteOnce() public {
        uint256 m = _mintMaster(0);
        vm.startPrank(controller);
        reg.setRoyaltyShare(m, 1000, makeAddr("sinkA"));
        vm.expectRevert(
            abi.encodeWithSelector(LicenseRegistry.RoyaltyShareAlreadySet.selector, m)
        );
        reg.setRoyaltyShare(m, 2000, makeAddr("sinkB"));
        vm.stopPrank();

        assertEq(reg.getMaster(m).royaltyShareBps, 1000, "investors' terms are frozen");
        assertEq(reg.getMaster(m).royaltyShareSink, makeAddr("sinkA"));
    }

    function test_RoyaltyIsSnapshottedPerLicense() public {
        uint256 m = _mintMaster(0);
        vm.startPrank(controller);
        uint256 a = reg.mintLicense(m, buyer, false, "u", 5000);
        uint256 b = reg.mintLicense(m, buyer, false, "u", 500);
        vm.stopPrank();

        (, uint256 ra) = reg.royaltyInfo(a, 10_000);
        (, uint256 rb) = reg.royaltyInfo(b, 10_000);
        assertEq(ra, 5000, "earlier licence keeps its rate");
        assertEq(rb, 500, "later licence gets the new rate");
    }

    // -------------------------------------------------------------------- bounds

    function test_RoyaltyCannotExceedHardMax() public {
        vm.prank(controller);
        vm.expectRevert(
            abi.encodeWithSelector(
                LicenseRegistry.RoyaltyTooHigh.selector, uint96(5001), uint96(5000)
            )
        );
        reg.mintMaster(artist, FID, "u", 0, address(0), 5001, 0);
    }

    function test_EditionCountCannotExceedHardMax() public {
        vm.prank(controller);
        vm.expectRevert(
            abi.encodeWithSelector(
                LicenseRegistry.InvalidEditionCount.selector, uint32(1001), uint32(1000)
            )
        );
        reg.mintMaster(artist, FID, "u", 1001, address(0), 500, 0);
    }

    // ---------------------------------------------------------------- governance

    function test_GovernanceHandoffIsTwoStep() public {
        address next = makeAddr("nextGovernance");

        vm.prank(governance);
        reg.setGovernance(next);
        assertEq(reg.governance(), governance, "authority does not move on propose");

        vm.prank(next);
        reg.acceptGovernance();
        assertEq(reg.governance(), next);
        assertEq(reg.pendingGovernance(), address(0));
    }

    function test_OnlyPendingCanAccept() public {
        vm.prank(governance);
        reg.setGovernance(makeAddr("nextGovernance"));

        vm.prank(stranger);
        vm.expectRevert(LicenseRegistry.NotPendingGovernance.selector);
        reg.acceptGovernance();
    }

    function test_GovernanceCannotBeRenounced() public {
        vm.prank(governance);
        vm.expectRevert(LicenseRegistry.GovernanceCannotBeRenounced.selector);
        reg.renounceGovernance();
    }

    function test_StrangerCannotSetController() public {
        vm.prank(stranger);
        vm.expectRevert(LicenseRegistry.NotGovernance.selector);
        reg.setController(stranger);
    }

    // ------------------------------------------------------------------ id ranges

    function test_MasterAndLicenseIdRangesAreDisjoint() public {
        uint256 m = _mintMaster(0);
        vm.prank(controller);
        uint256 lic = reg.mintLicense(m, buyer, false, "u", 500);

        assertFalse(reg.isLicense(m));
        assertTrue(reg.isLicense(lic));
        assertLt(m, reg.LICENSE_ID_OFFSET());
        assertGt(lic, reg.LICENSE_ID_OFFSET());
    }

    // ----------------------------------------------------------------- invariants

    /// @dev Collector supply can never exceed the cap, for any sequence of mints.
    function testFuzz_CollectorSupplyNeverExceedsCap(uint8 cap, uint8 attempts) public {
        cap = uint8(bound(cap, 1, 50));
        attempts = uint8(bound(attempts, 1, 100));

        uint256 m = _mintMaster(cap);
        vm.startPrank(controller);
        for (uint256 i; i < attempts; ++i) {
            try reg.mintLicense(m, buyer, true, "u", 500) {} catch {}
        }
        vm.stopPrank();

        assertLe(reg.getMaster(m).collectorsMinted, cap);
    }

    // ------------------------------------------- LiveRadioV3 compatibility layer
    //
    // These guard BREAK 3 in docs/INTEGRATION_MATRIX.md: LiveRadioV3 is repointed at this
    // registry at cutover and calls hasValidLicense / masterTokens on every queue request.

    function test_HasValidLicenseIsTrueForTheHolder() public {
        uint256 m = _mintMaster(0);
        vm.prank(controller);
        reg.mintLicense(m, buyer, false, "u", 500);

        assertTrue(reg.hasValidLicense(buyer, m));
        assertEq(reg.licensesHeld(buyer, m), 1);
        assertFalse(reg.hasValidLicense(stranger, m));
    }

    /// @dev This is V2's H1. There, the seller kept passing and the buyer kept failing,
    ///      because the index was only written at mint and never on transfer.
    function test_ResaleMovesTheLicenceCheckToTheBuyer() public {
        uint256 m = _mintMaster(0);
        vm.prank(controller);
        uint256 lic = reg.mintLicense(m, buyer, false, "u", 500);

        vm.prank(buyer);
        reg.transferFrom(buyer, stranger, lic);

        assertFalse(reg.hasValidLicense(buyer, m), "seller must stop passing");
        assertTrue(reg.hasValidLicense(stranger, m), "buyer must start passing");
        assertEq(reg.licensesHeld(buyer, m), 0);
        assertEq(reg.licensesHeld(stranger, m), 1);
    }

    function test_BurnClearsTheLicenceCheck() public {
        uint256 m = _mintMaster(0);
        vm.prank(controller);
        uint256 lic = reg.mintLicense(m, buyer, false, "u", 500);

        vm.prank(buyer);
        reg.burn(lic);

        assertFalse(reg.hasValidLicense(buyer, m));
        assertEq(reg.licensesHeld(buyer, m), 0);
    }

    function test_CountsAreIndependentPerMaster() public {
        uint256 m1 = _mintMaster(0);
        uint256 m2 = _mintMaster(0);
        vm.startPrank(controller);
        reg.mintLicense(m1, buyer, false, "u", 500);
        reg.mintLicense(m1, buyer, false, "u", 500);
        reg.mintLicense(m2, buyer, false, "u", 500);
        vm.stopPrank();

        assertEq(reg.licensesHeld(buyer, m1), 2);
        assertEq(reg.licensesHeld(buyer, m2), 1);

        // Holding two means selling one must not revoke access.
        vm.prank(buyer);
        reg.transferFrom(buyer, stranger, 1_000_001);
        assertTrue(reg.hasValidLicense(buyer, m1));
        assertEq(reg.licensesHeld(buyer, m1), 1);
    }

    /// @dev Arity, order and types must match V2 exactly or LiveRadioV3's abi.decode reverts.
    function test_MasterTokensReturnsTheFieldsLiveRadioReads() public {
        uint256 m = _mintMaster(7);

        (uint256 fid, address originalArtist, , , , , , , uint256 maxEd, , bool active, , ) =
            reg.masterTokens(m);

        assertEq(fid, FID);
        assertEq(originalArtist, artist);
        assertEq(maxEd, 7);
        assertTrue(active);
    }

    function test_MasterTokensReportsUnknownMasterAsInactive() public view {
        (, address originalArtist, , , , , , , , , bool active, , ) = reg.masterTokens(999);
        assertEq(originalArtist, address(0));
        assertFalse(active, "LiveRadioV3 requires active; an unknown master must not queue");
    }

    // -------------------------------------------------------------- moderation

    function test_ModeratorIsAppointedByGovernanceOnly() public {
        vm.prank(stranger);
        vm.expectRevert(LicenseRegistry.NotGovernance.selector);
        reg.setModerator(stranger);

        vm.prank(governance);
        reg.setModerator(stranger);
        assertEq(reg.moderator(), stranger);
    }

    function test_StrangerCannotSuspend() public {
        uint256 m = _mintMaster(0);
        vm.prank(stranger);
        vm.expectRevert(LicenseRegistry.NotModerator.selector);
        reg.setMasterSuspended(m, true, "nope");
    }

    function test_SuspensionStopsNewSalesAndRadio() public {
        uint256 m = _mintMaster(0);
        vm.prank(governance);
        reg.setMasterSuspended(m, true, "infringement report");

        assertTrue(reg.masterSuspended(m));
        assertEq(reg.masterSuspensionReason(m), "infringement report");

        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(LicenseRegistry.MasterIsSuspended.selector, m));
        reg.mintLicense(m, buyer, false, "u", 500);

        (, , , , , , , , , , bool active, , ) = reg.masterTokens(m);
        assertFalse(active, "LiveRadioV3 must stop queueing a suspended master");
    }

    /// @dev The point of the whole design: a ban must not reach a buyer's property.
    function test_SuspensionDoesNotTouchExistingLicenceHolders() public {
        uint256 m = _mintMaster(0);
        vm.prank(controller);
        uint256 lic = reg.mintLicense(m, buyer, false, "u", 500);

        vm.prank(governance);
        reg.setMasterSuspended(m, true, "abuse");

        assertTrue(reg.hasValidLicense(buyer, m), "a paid-for copy stays valid");
        assertEq(reg.ownerOf(lic), buyer, "suspension is not confiscation");

        vm.prank(buyer);
        reg.transferFrom(buyer, stranger, lic);
        assertEq(reg.ownerOf(lic), stranger, "and it stays resellable");
    }

    function test_SuspensionIsReversible() public {
        uint256 m = _mintMaster(0);
        vm.startPrank(governance);
        reg.setMasterSuspended(m, true, "reported");
        reg.setMasterSuspended(m, false, "");
        vm.stopPrank();

        assertFalse(reg.masterSuspended(m));
        assertEq(reg.masterSuspensionReason(m), "", "reason clears on restore");

        vm.prank(controller);
        reg.mintLicense(m, buyer, false, "u", 500);
        (, , , , , , , , , , bool active, , ) = reg.masterTokens(m);
        assertTrue(active);
    }

    function test_CannotSuspendAMasterThatDoesNotExist() public {
        vm.prank(governance);
        vm.expectRevert(abi.encodeWithSelector(LicenseRegistry.MasterNotFound.selector, 999));
        reg.setMasterSuspended(999, true, "x");
    }

    // ------------------------------------------------- permanent removal (purge)

    function test_PurgeIsGovernanceOnly() public {
        uint256 m = _mintMaster(0);

        vm.prank(governance);
        reg.setModerator(stranger);
        vm.prank(stranger);
        vm.expectRevert(LicenseRegistry.NotGovernance.selector);
        reg.purgeMaster(m, "hate speech");
    }

    function test_PurgeStopsSalesRadioAndTheContentPointer() public {
        uint256 m = _mintMaster(0);
        vm.prank(controller);
        uint256 lic = reg.mintLicense(m, buyer, false, "ipfs://lic", 500);

        vm.prank(governance);
        reg.purgeMaster(m, "hate speech");

        assertTrue(reg.masterPurged(m));
        assertEq(reg.masterPurgeReason(m), "hate speech");

        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(LicenseRegistry.MasterIsSuspended.selector, m));
        reg.mintLicense(m, buyer, false, "u", 500);

        (, , , , , , , , , , bool active, , ) = reg.masterTokens(m);
        assertFalse(active);

        // The registry stops pointing at the material — master and every licence of it.
        assertEq(reg.tokenURI(m), "");
        assertEq(reg.tokenURI(lic), "", "a licence of purged content serves no URI either");
    }

    /// @dev The whole point: there is no way back. No function clears masterPurged.
    function test_PurgeCannotBeReversedEvenByGovernance() public {
        uint256 m = _mintMaster(0);
        vm.startPrank(governance);
        reg.purgeMaster(m, "illegal");

        vm.expectRevert(abi.encodeWithSelector(LicenseRegistry.MasterIsPurged.selector, m));
        reg.setMasterSuspended(m, false, "changed my mind");

        vm.expectRevert(abi.encodeWithSelector(LicenseRegistry.MasterIsPurged.selector, m));
        reg.purgeMaster(m, "again");
        vm.stopPrank();

        assertTrue(reg.masterPurged(m));
    }

    /// @dev Even here, a ban is not confiscation. The holder keeps the token; it just points
    ///      at nothing. Seizing property was never the remedy for the artist's conduct.
    function test_PurgeDoesNotSeizeLicences() public {
        uint256 m = _mintMaster(0);
        vm.prank(controller);
        uint256 lic = reg.mintLicense(m, buyer, false, "u", 500);

        vm.prank(governance);
        reg.purgeMaster(m, "harassment");

        assertEq(reg.ownerOf(lic), buyer);
        assertTrue(reg.hasValidLicense(buyer, m));
    }

    function test_SuspendThenPurgeIsTheIntendedSequence() public {
        uint256 m = _mintMaster(0);

        // Moderator kills it instantly...
        vm.prank(governance);
        reg.setModerator(stranger);
        vm.prank(stranger);
        reg.setMasterSuspended(m, true, "reported: slur in title");
        (, , , , , , , , , , bool activeAfterSuspend, , ) = reg.masterTokens(m);
        assertFalse(activeAfterSuspend);

        // ...governance makes it permanent after review.
        vm.prank(governance);
        reg.purgeMaster(m, "confirmed: hate speech");
        assertTrue(reg.masterPurged(m));
    }
}
