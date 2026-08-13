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
     * @dev Farcaster identity is required, not optional. This is a deliberate product
     *      decision rather than a security control — the contract cannot verify that a FID
     *      exists or belongs to the caller, and the app enforces that against Neynar. What
     *      it does guarantee is that no master can exist without one, so the whole catalogue
     *      stays addressable by FID.
     */
    function test_FidIsRequired() public {
        vm.prank(controller);
        vm.expectRevert(LicenseRegistry.FidRequired.selector);
        reg.mintMaster(artist, 0, "u", 0, address(0), 500, 0);
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
}
