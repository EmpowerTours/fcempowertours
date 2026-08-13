// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../v3/LicenseRegistry.sol";
import "../v3/SalesController.sol";

contract MockWMON is ERC20 {
    constructor() ERC20("Wrapped MON", "WMON") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev A referrer that reverts on receive. Must not be able to block purchases.
contract HostileReferrer {
    receive() external payable {
        revert("no");
    }
}

contract SalesControllerTest is Test {
    LicenseRegistry reg;
    SalesController sales;
    MockWMON wmon;

    uint256 artistPk = 0xA11CE;
    uint256 sellerPk = 0xB0B;

    address artist;
    address seller;
    address governance = makeAddr("governance");
    address treasury = makeAddr("treasury");
    address buyer = makeAddr("buyer");
    address attacker = makeAddr("attacker");
    address referrer = makeAddr("referrer");

    uint256 constant PRICE = 35 ether;

    /// @dev V3 requires a nonzero artist FID. Farcaster identity is the primary key.
    uint256 constant FID = 868469;

    function setUp() public {
        artist = vm.addr(artistPk);
        seller = vm.addr(sellerPk);

        wmon = new MockWMON();
        reg = new LicenseRegistry(governance);
        sales = new SalesController(reg, IERC20(address(wmon)), governance, treasury);

        vm.prank(governance);
        reg.setController(address(sales));

        for (uint256 i; i < 4; ++i) {
            address a = [buyer, attacker, seller, artist][i];
            wmon.mint(a, 10_000 ether);
            vm.prank(a);
            wmon.approve(address(sales), type(uint256).max);
        }
    }

    function _master() internal returns (uint256) {
        vm.prank(artist);
        return sales.mintMaster(FID, "ipfs://m", 100, referrer, 5000, 0, PRICE, 500 ether);
    }

    function _buy(uint256 m, address who) internal returns (uint256) {
        vm.prank(who);
        return sales.purchase(m, false, "ipfs://l");
    }

    // =====================================================================
    // C1 — the critical V2 vulnerability
    // =====================================================================

    /**
     * In V2, `executeSaleFor(seller, buyer, licenseId, price)` had no caller check, so an
     * attacker could force any wallet with an outstanding allowance to buy a licence at a
     * price the attacker chose. Here a sale needs the seller's signature and the buyer is
     * msg.sender, so a third party has no way in.
     */
    function test_C1_AttackerCannotForceASaleWithoutSellerSignature() public {
        uint256 m = _master();
        uint256 lic = _buy(m, seller);

        SalesController.SaleOrder memory order = SalesController.SaleOrder({
            licenseId: lic,
            seller: seller,
            price: 9_000 ether,
            nonce: 1,
            deadline: block.timestamp + 1 days
        });

        // Attacker forges a signature from their own key.
        bytes memory forged = _signSale(order, uint256(0xBAD));

        vm.prank(attacker);
        vm.expectRevert(SalesController.BadSignature.selector);
        sales.executeSale(order, forged);

        assertEq(reg.ownerOf(lic), seller, "licence must not move");
    }

    /// @dev Even a validly signed order cannot be used to drain a third party: whoever
    ///      calls is the buyer and pays from their own balance.
    function test_C1_RelayerCannotMakeSomeoneElsePay() public {
        uint256 m = _master();
        uint256 lic = _buy(m, seller);

        SalesController.SaleOrder memory order = SalesController.SaleOrder({
            licenseId: lic,
            seller: seller,
            price: 100 ether,
            nonce: 1,
            deadline: block.timestamp + 1 days
        });
        bytes memory sig = _signSale(order, sellerPk);

        uint256 victimBefore = wmon.balanceOf(buyer);

        vm.prank(attacker);
        sales.executeSale(order, sig);

        assertEq(wmon.balanceOf(buyer), victimBefore, "uninvolved wallet untouched");
        assertEq(reg.ownerOf(lic), attacker, "the caller is the buyer, and they paid");
    }

    function test_SaleSignatureCannotBeReplayed() public {
        uint256 m = _master();
        uint256 lic = _buy(m, seller);

        SalesController.SaleOrder memory order = SalesController.SaleOrder({
            licenseId: lic,
            seller: seller,
            price: 50 ether,
            nonce: 7,
            deadline: block.timestamp + 1 days
        });
        bytes memory sig = _signSale(order, sellerPk);

        vm.prank(buyer);
        sales.executeSale(order, sig);

        vm.prank(buyer);
        reg.transferFrom(buyer, seller, lic);

        vm.prank(attacker);
        vm.expectRevert(
            abi.encodeWithSelector(SalesController.NonceAlreadyUsed.selector, seller, uint256(7))
        );
        sales.executeSale(order, sig);
    }

    function test_ExpiredSaleOrderIsRejected() public {
        uint256 m = _master();
        uint256 lic = _buy(m, seller);

        SalesController.SaleOrder memory order = SalesController.SaleOrder({
            licenseId: lic,
            seller: seller,
            price: 50 ether,
            nonce: 1,
            deadline: block.timestamp + 1 hours
        });
        bytes memory sig = _signSale(order, sellerPk);

        vm.warp(block.timestamp + 2 hours);
        vm.prank(buyer);
        vm.expectRevert(
            abi.encodeWithSelector(SalesController.SignatureExpired.selector, order.deadline)
        );
        sales.executeSale(order, sig);
    }

    /// @dev A signature is bound to exact terms; a relayer cannot raise the price.
    function test_SaleTermsCannotBeAltered() public {
        uint256 m = _master();
        uint256 lic = _buy(m, seller);

        SalesController.SaleOrder memory signed = SalesController.SaleOrder({
            licenseId: lic,
            seller: seller,
            price: 50 ether,
            nonce: 1,
            deadline: block.timestamp + 1 days
        });
        bytes memory sig = _signSale(signed, sellerPk);

        SalesController.SaleOrder memory tampered = signed;
        tampered.price = 5_000 ether;

        vm.prank(attacker);
        vm.expectRevert(SalesController.BadSignature.selector);
        sales.executeSale(tampered, sig);
    }

    // =====================================================================
    // M5 — artist binding
    // =====================================================================

    function test_M5_DirectMintBindsArtistToSender() public {
        vm.prank(attacker);
        uint256 m = sales.mintMaster(FID, "u", 0, address(0), 500, 0, PRICE, 0);
        assertEq(reg.getMaster(m).artist, attacker, "cannot mint in someone else's name");
    }

    function test_M5_DelegatedMintRequiresArtistSignature() public {
        SalesController.MintRequest memory req = _mintReq();
        bytes memory forged = _signMint(req, uint256(0xBAD));

        vm.prank(attacker);
        vm.expectRevert(SalesController.BadSignature.selector);
        sales.mintMasterFor(req, forged);
    }

    function test_M5_RelayerCannotAlterMintedFields() public {
        SalesController.MintRequest memory req = _mintReq();
        bytes memory sig = _signMint(req, artistPk);

        SalesController.MintRequest memory tampered = req;
        tampered.uri = "ipfs://attacker-content";

        vm.prank(attacker);
        vm.expectRevert(SalesController.BadSignature.selector);
        sales.mintMasterFor(tampered, sig);
    }

    function test_DelegatedMintSucceedsWithValidSignature() public {
        SalesController.MintRequest memory req = _mintReq();
        bytes memory sig = _signMint(req, artistPk);

        vm.prank(attacker); // relayer pays gas; artist consented
        uint256 m = sales.mintMasterFor(req, sig);
        assertEq(reg.getMaster(m).artist, artist);
    }

    // =====================================================================
    // Payment split
    // =====================================================================

    function test_ArtistGets90PercentAndTreasury10() public {
        uint256 m = _master();
        uint256 a0 = wmon.balanceOf(artist);
        uint256 t0 = wmon.balanceOf(treasury);

        _buy(m, buyer);

        assertEq(wmon.balanceOf(artist) - a0, 31.5 ether);
        assertEq(wmon.balanceOf(treasury) - t0, 3.5 ether);
    }

    /// @dev The referral must never come out of the artist's share.
    function test_ReferralComesFromTreasuryNotArtist() public {
        vm.prank(governance);
        sales.setReferrerBps(3000); // 30% of the platform fee

        uint256 m = _master();
        uint256 a0 = wmon.balanceOf(artist);
        uint256 t0 = wmon.balanceOf(treasury);

        _buy(m, buyer);

        assertEq(wmon.balanceOf(artist) - a0, 31.5 ether, "artist share unchanged");
        assertEq(wmon.balanceOf(treasury) - t0, 2.45 ether, "platform absorbs it");
        assertEq(sales.referralBalance(referrer), 1.05 ether);
    }

    function test_ReferralIsPullNotPush() public {
        vm.prank(governance);
        sales.setReferrerBps(3000);
        uint256 m = _master();
        _buy(m, buyer);

        uint256 before = wmon.balanceOf(referrer);
        vm.prank(referrer);
        sales.claimReferral();
        assertEq(wmon.balanceOf(referrer) - before, 1.05 ether);
        assertEq(sales.referralBalance(referrer), 0);
    }

    /**
     * @dev The window is keyed to the *artist*, not to the master. Keying it per-master
     *      would restart the 12-month clock on every upload, so a referrer who introduced
     *      a prolific artist would be paid forever for one introduction.
     */
    function test_ReferralWindowIsScopedToTheArtistNotTheMaster() public {
        vm.prank(governance);
        sales.setReferrerBps(3000);

        uint256 first = _master();
        _buy(first, buyer); // starts the artist's clock
        assertEq(sales.referralBalance(referrer), 1.05 ether);

        vm.warp(block.timestamp + 366 days);

        // A brand new master by the same artist. Its own first sale is long after the
        // artist's, so it must fall outside the window rather than opening a fresh one.
        uint256 second = _master();
        _buy(second, buyer);

        assertEq(sales.referralBalance(referrer), 1.05 ether, "window must not restart");
    }

    function test_ReferralAccruesOnANewMasterInsideTheWindow() public {
        vm.prank(governance);
        sales.setReferrerBps(3000);

        uint256 first = _master();
        _buy(first, buyer);

        vm.warp(block.timestamp + 300 days);

        uint256 second = _master();
        _buy(second, buyer);

        assertEq(sales.referralBalance(referrer), 2.1 ether, "still inside the window");
    }

    function test_ReferralStopsAfterTheWindowOnTheSameMaster() public {
        vm.prank(governance);
        sales.setReferrerBps(3000);

        uint256 m = _master();
        _buy(m, buyer);

        vm.warp(block.timestamp + 366 days);
        _buy(m, attacker);

        assertEq(sales.referralBalance(referrer), 1.05 ether);
    }

    function test_ArtistClockStartsAtFirstSaleNotAtMint() public {
        vm.prank(governance);
        sales.setReferrerBps(3000);

        uint256 m = _master();
        vm.warp(block.timestamp + 200 days); // minted, unsold

        _buy(m, buyer);
        assertEq(sales.artistFirstSaleAt(artist), uint64(block.timestamp));

        vm.warp(block.timestamp + 300 days); // 300 days after the first *sale*
        _buy(m, attacker);
        assertEq(sales.referralBalance(referrer), 2.1 ether);
    }

    /// @dev A referrer that cannot receive must not be able to block sales.
    function test_HostileReferrerCannotBlockPurchases() public {
        HostileReferrer hostile = new HostileReferrer();
        vm.prank(governance);
        sales.setReferrerBps(3000);

        vm.prank(artist);
        uint256 m = sales.mintMaster(FID, "u", 0, address(hostile), 500, 0, PRICE, 0);

        _buy(m, buyer); // must not revert
        assertEq(sales.referralBalance(address(hostile)), 1.05 ether);
    }

    function test_RoyaltyShareSplitsFromArtistCut() public {
        uint256 m = _master();
        address sink = makeAddr("clearwaveSink");

        vm.prank(artist);
        sales.setRoyaltyShare(m, 1000, sink); // 10% of the artist's cut

        uint256 a0 = wmon.balanceOf(artist);
        _buy(m, buyer);

        assertEq(wmon.balanceOf(sink), 3.15 ether, "10% of 31.5");
        assertEq(wmon.balanceOf(artist) - a0, 28.35 ether);
    }

    function test_TotalPaidAlwaysEqualsPrice() public {
        vm.prank(governance);
        sales.setReferrerBps(3000);
        uint256 m = _master();
        address sink = makeAddr("sink2");
        vm.prank(artist);
        sales.setRoyaltyShare(m, 1000, sink);

        uint256 b0 = wmon.balanceOf(buyer);
        _buy(m, buyer);

        assertEq(b0 - wmon.balanceOf(buyer), PRICE, "no dust created or lost");
    }

    // =====================================================================
    // Governance bounds
    // =====================================================================

    function test_GovernanceCannotExceedReferrerCap() public {
        vm.prank(governance);
        vm.expectRevert(
            abi.encodeWithSelector(SalesController.BpsTooHigh.selector, uint96(5001), uint96(5000))
        );
        sales.setReferrerBps(5001);
    }

    function test_GovernanceCannotExceedTreasuryCap() public {
        vm.prank(governance);
        vm.expectRevert(
            abi.encodeWithSelector(SalesController.BpsTooHigh.selector, uint96(3001), uint96(3000))
        );
        sales.setTreasuryFeeBps(3001);
    }

    function test_StrangerCannotSetParameters() public {
        vm.prank(attacker);
        vm.expectRevert(SalesController.NotGovernance.selector);
        sales.setReferrerBps(1000);
    }

    /// @dev Changing the default must not touch a licence somebody already bought.
    function test_ResaleRoyaltyChangeIsNotRetroactive() public {
        uint256 m = _master();
        uint256 lic = _buy(m, buyer);
        (, uint256 before) = reg.royaltyInfo(lic, 10_000);

        vm.prank(governance);
        sales.setResaleRoyaltyBps(500, 500);

        (, uint256 after_) = reg.royaltyInfo(lic, 10_000);
        assertEq(after_, before, "existing licence keeps its rate");

        uint256 lic2 = _buy(m, buyer);
        (, uint256 fresh) = reg.royaltyInfo(lic2, 10_000);
        assertEq(fresh, 500, "new licence gets the new rate");
    }

    // =====================================================================
    // Artist controls
    // =====================================================================

    function test_OnlyArtistCanSetPricing() public {
        uint256 m = _master();
        vm.prank(attacker);
        vm.expectRevert(SalesController.NotArtist.selector);
        sales.setPricing(m, 1 ether, 1 ether);
    }

    function test_PausedSalesRevert() public {
        uint256 m = _master();
        vm.prank(artist);
        sales.setSalesPaused(m, true);

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(SalesController.SalesPaused.selector, m));
        sales.purchase(m, false, "u");
    }

    /// @dev A sold-out collector tier must revert before taking any payment.
    function test_SoldOutCollectorTakesNoPayment() public {
        vm.prank(artist);
        uint256 m = sales.mintMaster(FID, "u", 1, address(0), 500, 0, PRICE, 500 ether);

        vm.prank(buyer);
        sales.purchase(m, true, "u");

        uint256 b0 = wmon.balanceOf(buyer);
        vm.prank(buyer);
        vm.expectRevert();
        sales.purchase(m, true, "u");
        assertEq(wmon.balanceOf(buyer), b0, "no payment on a failed mint");
    }

    // =====================================================================
    // helpers
    // =====================================================================

    function _mintReq() internal view returns (SalesController.MintRequest memory) {
        return SalesController.MintRequest({
            artist: artist,
            artistFid: FID,
            uri: "ipfs://signed",
            maxCollectorEditions: 10,
            referrer: referrer,
            royaltyBps: 500,
            nftType: 0,
            price: PRICE,
            collectorPrice: 500 ether,
            nonce: 1,
            deadline: block.timestamp + 1 days
        });
    }

    function _signMint(SalesController.MintRequest memory r, uint256 pk)
        internal
        view
        returns (bytes memory)
    {
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "MintRequest(address artist,uint256 artistFid,string uri,uint32 maxCollectorEditions,address referrer,uint96 royaltyBps,uint8 nftType,uint256 price,uint256 collectorPrice,uint256 nonce,uint256 deadline)"
                ),
                r.artist,
                r.artistFid,
                keccak256(bytes(r.uri)),
                r.maxCollectorEditions,
                r.referrer,
                r.royaltyBps,
                r.nftType,
                r.price,
                r.collectorPrice,
                r.nonce,
                r.deadline
            )
        );
        return _sign(structHash, pk);
    }

    function _signSale(SalesController.SaleOrder memory o, uint256 pk)
        internal
        view
        returns (bytes memory)
    {
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "SaleOrder(uint256 licenseId,address seller,uint256 price,uint256 nonce,uint256 deadline)"
                ),
                o.licenseId,
                o.seller,
                o.price,
                o.nonce,
                o.deadline
            )
        );
        return _sign(structHash, pk);
    }

    function _sign(bytes32 structHash, uint256 pk) internal view returns (bytes memory) {
        bytes32 digest =
            keccak256(abi.encodePacked("\x19\x01", sales.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }
}
