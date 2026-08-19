// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../PassportNFTV4.sol";

contract MockWMON is ERC20 {
    constructor() ERC20("Wrapped MON", "WMON") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/**
 * @title PassportNFTV4 tests
 * @dev V3 refused a passport to anyone without a Farcaster ID, and would have refused it to
 *      every wallet-only user but the first if a placeholder FID had been used instead. Those
 *      two failures are what this suite is for.
 */
contract PassportNFTV4Test is Test {
    PassportNFTV4 passport;
    MockWMON wmon;

    address platformWallet = makeAddr("platformWallet");
    address oracle = makeAddr("oracle");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");
    address relayer = makeAddr("relayer");

    uint256 constant FID_A = 868469;
    uint256 constant FID_B = 213442;

    string constant MX = "MX";
    string constant TH = "TH";

    /// @dev Start well past epoch: at `block.timestamp = 1` the mint cooldown compares against
    ///      a zeroed `lastMintTime` and every first mint looks like a repeat. An artefact of the
    ///      test clock, not of the contract.
    uint256 constant START_TS = 365 days * 55;

    function setUp() public {
        vm.warp(START_TS);

        wmon = new MockWMON();
        passport = new PassportNFTV4(address(wmon), oracle, platformWallet);

        // Only the relayed path needs authorisation; self-minting is open in V4.
        passport.setAuthorizedMinter(relayer, true);

        address[4] memory payers = [alice, bob, carol, relayer];
        for (uint256 i = 0; i < payers.length; i++) {
            wmon.mint(payers[i], 1_000_000 ether);
            vm.prank(payers[i]);
            wmon.approve(address(passport), type(uint256).max);
        }
    }

    function _mint(address who, uint256 fid, string memory code) internal returns (uint256) {
        vm.prank(who);
        return passport.mint(fid, code, "Mexico", "LATAM", "North America", "ipfs://p");
    }

    /// @dev The mint cooldown is per-address; skip past it between mints by the same wallet.
    function _clearCooldown() internal {
        skip(2 days);
    }

    // =====================================================================
    // The V3 failures
    // =====================================================================

    /// @dev V3: `require(userFid > 0, "Invalid FID")`.
    function test_AWalletOnlyUserCanMintAPassport() public {
        uint256 id = _mint(alice, 0, MX);

        assertEq(passport.ownerOf(id), alice);
        assertTrue(passport.hasPassport(alice, MX));
        assertEq(passport.getPassportByAddress(alice, MX), id);
    }

    /**
     * @dev The collision that made a placeholder FID unworkable. Under V3's rule with a shared
     *      FID, carol's mint would revert with "FID already has passport for this country" —
     *      a dedup aimed at Farcaster accounts refusing service to people who have none.
     */
    function test_ManyWalletOnlyUsersCanEachHoldTheSameCountry() public {
        _mint(alice, 0, MX);
        _mint(bob, 0, MX);
        _mint(carol, 0, MX);

        assertTrue(passport.hasPassport(alice, MX));
        assertTrue(passport.hasPassport(bob, MX));
        assertTrue(passport.hasPassport(carol, MX));
        assertEq(passport.getPassportByFid(0, MX), 0, "FID 0 is never indexed");
    }

    function test_FarcasterUsersStillGetTheirFidDedup() public {
        _mint(alice, FID_A, MX);

        // The same FID, a different wallet: still refused, which is the point of the index.
        vm.prank(bob);
        vm.expectRevert("FID already has passport for this country");
        passport.mint(FID_A, MX, "Mexico", "LATAM", "North America", "ipfs://p");
    }

    function test_FarcasterAndWalletOnlyHoldersCoexist() public {
        uint256 a = _mint(alice, FID_A, MX);
        uint256 b = _mint(bob, 0, MX);
        uint256 c = _mint(carol, FID_B, MX);

        assertEq(passport.getPassportByFid(FID_A, MX), a);
        assertEq(passport.getPassportByFid(FID_B, MX), c);
        assertEq(passport.getPassportByAddress(bob, MX), b);
        assertEq(passport.getPassportByFid(0, MX), 0);
    }

    // =====================================================================
    // The dedup that actually carries meaning
    // =====================================================================

    function test_OneWalletCannotHoldTwoPassportsForOneCountry() public {
        _mint(alice, 0, MX);
        _clearCooldown();

        vm.prank(alice);
        vm.expectRevert("Already own passport for this country");
        passport.mint(0, MX, "Mexico", "LATAM", "North America", "ipfs://p");
    }

    function test_OneWalletCanHoldDifferentCountries() public {
        _mint(alice, 0, MX);
        _clearCooldown();

        vm.prank(alice);
        uint256 th = passport.mint(0, TH, "Thailand", "SEA", "Asia", "ipfs://p2");

        assertTrue(passport.hasPassport(alice, MX));
        assertTrue(passport.hasPassport(alice, TH));
        assertGt(th, 0);
    }

    function test_TheAddressDedupHoldsForFarcasterUsersToo() public {
        _mint(alice, FID_A, MX);
        _clearCooldown();

        vm.prank(alice);
        vm.expectRevert("Already own passport for this country");
        passport.mint(FID_A, MX, "Mexico", "LATAM", "North America", "ipfs://p");
    }

    // =====================================================================
    // Relayed minting — the app pays from the platform Safe
    // =====================================================================

    function test_TheRelayerCanMintForAWalletOnlyUser() public {
        vm.prank(relayer);
        uint256 id = passport.mintFor(alice, 0, MX, "Mexico", "LATAM", "North America", "ipfs://p");

        assertEq(passport.ownerOf(id), alice, "the passport lands on the user");
        assertEq(wmon.balanceOf(alice), 1_000_000 ether, "the relayer paid");
    }

    function test_MintingForTheZeroAddressIsRejected() public {
        vm.prank(relayer);
        vm.expectRevert("Invalid beneficiary");
        passport.mintFor(address(0), 0, MX, "Mexico", "LATAM", "North America", "ipfs://p");
    }

    /// @dev The relayed path is still gated — it is the one where the payer is not the recipient.
    function test_AnUnauthorisedRelayerCannotMintForSomeoneElse() public {
        vm.prank(bob);
        vm.expectRevert("Not authorized to mint");
        passport.mintFor(alice, 0, MX, "Mexico", "LATAM", "North America", "ipfs://p");
    }

    /// @dev And self-minting is open, so a browser visitor with no registered Safe can mint.
    function test_SelfMintingNeedsNoAuthorisation() public {
        assertFalse(passport.authorizedMinters(alice), "alice is on nobody's list");
        uint256 id = _mint(alice, 0, MX);
        assertEq(passport.ownerOf(id), alice);
    }

    // =====================================================================
    // Lookups
    // =====================================================================

    /// @dev The live consumer is register-guide/route.ts, which reads getPassportByFid.
    function test_TheFidLookupStillWorksForFarcasterHolders() public {
        uint256 id = _mint(alice, FID_A, MX);

        assertEq(passport.getPassportByFid(FID_A, MX), id);
        assertTrue(passport.hasPassportByFid(FID_A, MX));
    }

    /**
     * @dev And why that consumer needs migrating: a wallet-only holder owns a passport that the
     *      FID lookup cannot see. The address sibling is what makes them visible.
     */
    function test_TheFidLookupCannotSeeAWalletOnlyHolder() public {
        uint256 id = _mint(alice, 0, MX);

        assertEq(passport.getPassportByFid(0, MX), 0, "invisible by FID...");
        assertFalse(passport.hasPassportByFid(0, MX));

        assertEq(passport.getPassportByAddress(alice, MX), id, "...visible by address");
        assertTrue(passport.hasPassportByAddress(alice, MX));
    }

    function test_LookupsForSomeoneWithNoPassportAreEmpty() public view {
        assertEq(passport.getPassportByAddress(carol, MX), 0);
        assertFalse(passport.hasPassportByAddress(carol, MX));
    }

    // =====================================================================
    // Admin
    // =====================================================================

    function test_OwnerCanRepairATokenURI() public {
        uint256 id = _mint(alice, 0, MX);

        passport.setTokenURI(id, "ipfs://fixed");
        assertEq(passport.tokenURI(id), "ipfs://fixed");
    }

    function test_RepairingANonexistentTokenReverts() public {
        vm.expectRevert("Token does not exist");
        passport.setTokenURI(999, "ipfs://nope");
    }

    function test_StrangersCannotRewriteATokenURI() public {
        uint256 id = _mint(alice, 0, MX);

        vm.prank(bob);
        vm.expectRevert();
        passport.setTokenURI(id, "ipfs://hijacked");
    }

    // =====================================================================
    // Carried over from V3 unchanged
    // =====================================================================

    function test_TheMintFeeReachesThePlatformWallet() public {
        uint256 price = passport.MINT_PRICE();
        _mint(alice, 0, MX);

        assertEq(wmon.balanceOf(platformWallet), price);
    }

    function test_TheCooldownStillApplies() public {
        _mint(alice, 0, MX);

        vm.prank(alice);
        vm.expectRevert(); // "Cooldown: Ns remaining"
        passport.mint(0, TH, "Thailand", "SEA", "Asia", "ipfs://p2");
    }

    function test_PassportMetadataRecordsTheFidWhenThereIsOne() public {
        uint256 withFid = _mint(alice, FID_A, MX);
        uint256 without = _mint(bob, 0, MX);

        assertEq(passport.getPassportData(withFid).userFid, FID_A);
        assertEq(passport.getPassportData(without).userFid, 0, "0 means no Farcaster account");
    }
}
