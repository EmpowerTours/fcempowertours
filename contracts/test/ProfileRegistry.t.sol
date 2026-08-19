// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Test.sol";
import "../v3/ProfileRegistry.sol";

/**
 * @title ProfileRegistry tests
 * @dev The registry exists so a wallet-only artist is not rendered as `0x1a2b…f9c0`. The tests
 *      that matter are the ones about names colliding, being freed, and being taken away —
 *      everything else is a length check.
 */
contract ProfileRegistryTest is Test {
    ProfileRegistry reg;

    address governance = makeAddr("governance");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address stranger = makeAddr("stranger");

    function setUp() public {
        reg = new ProfileRegistry(governance);
    }

    function _set(address who, string memory name) internal {
        vm.prank(who);
        reg.setProfile(name, "", "");
    }

    // ------------------------------------------------------------ the basics

    function test_AWalletOnlyArtistGetsAName() public {
        vm.prank(alice);
        reg.setProfile("Unify34", "ipfs://avatar", "makes noise");

        ProfileRegistry.Profile memory p = reg.getProfile(alice);
        assertEq(p.displayName, "Unify34");
        assertEq(p.avatarURI, "ipfs://avatar");
        assertEq(p.bio, "makes noise");
        assertEq(uint256(p.updatedAt), block.timestamp);
        assertEq(reg.displayNameOf(alice), "Unify34");
    }

    function test_SomeoneWithNoProfileHasAnEmptyName() public view {
        assertEq(reg.displayNameOf(stranger), "", "the app falls back to the address");
        assertEq(reg.ownerOfName("nobody"), address(0));
        assertTrue(reg.isNameAvailable("nobody"));
    }

    function test_ThereIsNoWayToSetSomeoneElsesName() public {
        // The only setter takes no owner argument, so this is a shape assertion: the sole
        // profile-writing entry point is msg.sender's own.
        _set(alice, "Alice");
        vm.prank(bob);
        reg.setProfile("Bob", "", "");

        assertEq(reg.displayNameOf(alice), "Alice", "bob cannot have touched alice's name");
        assertEq(reg.displayNameOf(bob), "Bob");
    }

    // -------------------------------------------------------------- collision

    function test_TwoPeopleCannotHoldTheSameName() public {
        _set(alice, "Unify34");

        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(ProfileRegistry.NameTaken.selector, "Unify34", alice)
        );
        reg.setProfile("Unify34", "", "");
    }

    /// @dev Case-only variants must collide, or the uniqueness guarantee is worthless.
    function test_NamesCollideRegardlessOfCase() public {
        _set(alice, "Unify34");

        vm.prank(bob);
        vm.expectRevert();
        reg.setProfile("UNIFY34", "", "");

        vm.prank(bob);
        vm.expectRevert();
        reg.setProfile("unify34", "", "");

        assertEq(reg.ownerOfName("UnIfY34"), alice, "lookup is case-insensitive too");
    }

    function test_RenamingFreesTheOldName() public {
        _set(alice, "OldName");
        _set(alice, "NewName");

        assertEq(reg.displayNameOf(alice), "NewName");
        assertTrue(reg.isNameAvailable("OldName"), "a rename must not park the old name forever");

        _set(bob, "OldName");
        assertEq(reg.ownerOfName("OldName"), bob);
    }

    function test_KeepingYourNameWhileChangingYourAvatar() public {
        _set(alice, "Unify34");

        vm.prank(alice);
        reg.setProfile("Unify34", "ipfs://new", "new bio");

        assertEq(reg.ownerOfName("Unify34"), alice, "you do not lose your own name to yourself");
        assertEq(reg.getProfile(alice).avatarURI, "ipfs://new");
    }

    function test_ClearingYourProfileFreesTheName() public {
        _set(alice, "Unify34");

        vm.prank(alice);
        reg.clearOwnProfile();

        assertEq(reg.displayNameOf(alice), "");
        assertTrue(reg.isNameAvailable("Unify34"));

        _set(bob, "Unify34");
        assertEq(reg.ownerOfName("Unify34"), bob);
    }

    function test_ClearingAProfileYouDoNotHaveReverts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ProfileRegistry.NoProfile.selector, alice));
        reg.clearOwnProfile();
    }

    // ------------------------------------------------------------- moderation

    function test_GovernanceCanTakeDownAnImpersonatingName() public {
        _set(alice, "Unify34");

        vm.prank(governance);
        reg.clearProfile(alice, "impersonation");

        assertEq(reg.displayNameOf(alice), "");
        assertTrue(reg.isNameAvailable("Unify34"), "the name goes back into circulation");
    }

    /// @dev A takedown removes a label. It must not lock the address out.
    function test_ATakedownDoesNotBanTheAccount() public {
        _set(alice, "Unify34");
        vm.prank(governance);
        reg.clearProfile(alice, "impersonation");

        _set(alice, "SomethingElse");
        assertEq(reg.displayNameOf(alice), "SomethingElse");
    }

    function test_StrangersCannotTakeDownAName() public {
        _set(alice, "Unify34");

        vm.prank(stranger);
        vm.expectRevert(ProfileRegistry.NotGovernance.selector);
        reg.clearProfile(alice, "because I said so");
    }

    function test_GovernanceHandoffIsTwoStep() public {
        vm.prank(governance);
        reg.transferGovernance(bob);
        assertEq(reg.governance(), governance, "not until it is accepted");

        vm.prank(stranger);
        vm.expectRevert(ProfileRegistry.NotPendingGovernance.selector);
        reg.acceptGovernance();

        vm.prank(bob);
        reg.acceptGovernance();
        assertEq(reg.governance(), bob);
        assertEq(reg.pendingGovernance(), address(0));
    }

    function test_GovernanceCannotBeRenounced() public {
        vm.prank(governance);
        vm.expectRevert(ProfileRegistry.GovernanceCannotBeRenounced.selector);
        reg.renounceGovernance();
    }

    function test_GovernanceCannotBeSetToZero() public {
        vm.prank(governance);
        vm.expectRevert(ProfileRegistry.ZeroAddress.selector);
        reg.transferGovernance(address(0));
    }

    // ------------------------------------------------------------- validation

    function test_EmptyNamesAreRejected() public {
        vm.prank(alice);
        vm.expectRevert(ProfileRegistry.NameEmpty.selector);
        reg.setProfile("", "", "");
    }

    function test_OverlongNamesAreRejected() public {
        string memory tooLong = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"; // 33 bytes
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(ProfileRegistry.NameTooLong.selector, uint256(33), uint256(32))
        );
        reg.setProfile(tooLong, "", "");

        _set(alice, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"); // exactly 32 is fine
        assertEq(bytes(reg.displayNameOf(alice)).length, 32);
    }

    /**
     * @dev Control characters can hide or reorder text in a UI, so a name carrying one could
     *      render as something entirely different from what is stored.
     */
    function test_ControlCharactersAreRejected() public {
        vm.startPrank(alice);
        vm.expectRevert(ProfileRegistry.NameHasControlCharacters.selector);
        reg.setProfile(string(abi.encodePacked("Uni", bytes1(0x00), "fy")), "", "");

        vm.expectRevert(ProfileRegistry.NameHasControlCharacters.selector);
        reg.setProfile(string(abi.encodePacked("Uni", bytes1(0x0A), "fy")), "", "");

        vm.expectRevert(ProfileRegistry.NameHasControlCharacters.selector);
        reg.setProfile(string(abi.encodePacked("Uni", bytes1(0x7F), "fy")), "", "");
        vm.stopPrank();
    }

    /// @dev " Unify34" and "Unify34" look identical in a list and must not both be claimable.
    function test_LeadingAndTrailingSpacesAreRejected() public {
        vm.startPrank(alice);
        vm.expectRevert(ProfileRegistry.NameHasEdgeWhitespace.selector);
        reg.setProfile(" Unify34", "", "");

        vm.expectRevert(ProfileRegistry.NameHasEdgeWhitespace.selector);
        reg.setProfile("Unify34 ", "", "");
        vm.stopPrank();

        _set(alice, "Uni fy34"); // an interior space is a normal name
        assertEq(reg.displayNameOf(alice), "Uni fy34");
    }

    /// @dev Accented Latin must work — the roster is Spanish-speaking.
    function test_AccentedNamesAreAccepted() public {
        _set(alice, unicode"Peña");
        assertEq(reg.displayNameOf(alice), unicode"Peña");
        assertEq(reg.ownerOfName(unicode"Peña"), alice);
    }

    /**
     * @dev The limit of what uniqueness promises, written down as a test rather than left as a
     *      surprise: a Cyrillic homoglyph is a different byte string and registers fine. This is
     *      the case {clearProfile} exists for, and the reason the app must show the address.
     */
    function test_HomoglyphsAreNotCaughtByUniqueness() public {
        _set(alice, "Unify34");
        _set(bob, unicode"Unifу34"); // Cyrillic 'у' (U+0443)

        assertEq(reg.ownerOfName("Unify34"), alice);
        assertEq(reg.ownerOfName(unicode"Unifу34"), bob, "confusable, and not detected on-chain");

        // Which is why governance can take it down.
        vm.prank(governance);
        reg.clearProfile(bob, "homoglyph impersonation");
        assertEq(reg.displayNameOf(bob), "");
    }

    function test_OverlongAvatarAndBioAreRejected() public {
        bytes memory big = new bytes(513);
        for (uint256 i = 0; i < 513; i++) big[i] = "a";

        vm.startPrank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(ProfileRegistry.AvatarTooLong.selector, uint256(513), uint256(256))
        );
        reg.setProfile("Alice", string(big), "");

        vm.expectRevert(
            abi.encodeWithSelector(ProfileRegistry.BioTooLong.selector, uint256(513), uint256(512))
        );
        reg.setProfile("Alice", "", string(big));
        vm.stopPrank();
    }

    /// @dev A rejected registration must leave no trace — no half-claimed name.
    function test_ARejectedRegistrationClaimsNothing() public {
        _set(alice, "Alice");

        vm.prank(bob);
        vm.expectRevert();
        reg.setProfile("Alice", "", "");

        assertEq(reg.displayNameOf(bob), "", "bob has no profile");
        assertEq(reg.ownerOfName("Alice"), alice, "alice still holds her name");
    }

    function testFuzz_AnyValidNameRoundTrips(address who, uint8 rawLen) public {
        vm.assume(who != address(0));
        uint256 len = bound(uint256(rawLen), 1, 32);

        bytes memory name = new bytes(len);
        for (uint256 i = 0; i < len; i++) {
            name[i] = bytes1(uint8(0x61 + (i % 26))); // a-z, never a space or control char
        }

        vm.prank(who);
        reg.setProfile(string(name), "", "");

        assertEq(reg.displayNameOf(who), string(name));
        assertEq(reg.ownerOfName(string(name)), who);
    }
}
