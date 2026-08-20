// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../v3/LicenseRegistry.sol";
import "../v3/SalesController.sol";
import "../v3/ProfileRegistry.sol";
import "../v3/SubscriptionReferrals.sol";
import "../MusicSubscriptionV6.sol";
import "../PassportNFTV4.sol";

contract MockWMON is ERC20 {
    constructor() ERC20("Wrapped MON", "WMON") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MockRewardManager {
    function getCurrentReward(uint8) external pure returns (uint256) {
        return 100 ether;
    }

    function distributeReward(address, uint8) external pure returns (uint256) {
        return 100 ether;
    }
}

/**
 * @title End-to-end rehearsal of the v3 deployment
 * @dev The unit suites prove each contract behaves. This one proves the **deployment** behaves:
 *      it wires the whole set together the way the deploy script will, then walks the journeys a
 *      real person takes — with a real EIP-712 signature produced by a real key, not a mock.
 *
 *      It exists because every serious outage in this app so far has been a wiring mistake rather
 *      than a code bug: an oracle pointed at a superseded contract, a reward manager paying a
 *      deprecated token. Those all pass a unit suite and fail in production.
 *
 *      The organising question is the one that matters commercially: **can somebody with only a
 *      wallet do every single thing a Farcaster user can do, at the same time, without either
 *      getting in the other's way?**
 */
contract V3IntegrationTest is Test {
    LicenseRegistry registry;
    SalesController sales;
    MusicSubscriptionV6 subscription;
    ProfileRegistry profiles;
    PassportNFTV4 passport;
    SubscriptionReferrals referrals;
    MockWMON wmon;
    MockRewardManager rewards;

    address governance = makeAddr("governance");
    address treasury = makeAddr("treasury");
    address oracle = makeAddr("oracle");
    address relayer = makeAddr("relayer");

    // A wallet-only artist, with a real private key so the EIP-712 signature is genuine.
    uint256 walletArtistKey = 0xA11CE;
    address walletArtist;

    uint256 farcasterArtistKey = 0xB0B;
    address farcasterArtist;

    address walletListener = makeAddr("walletListener");
    address farcasterListener = makeAddr("farcasterListener");
    address buyer = makeAddr("buyer");

    uint256 constant FID = 868469;
    uint256 constant START_TS = 365 days * 55;

    uint256 constant TRACK_PRICE = 50 ether;
    uint8 constant MUSIC = 0;

    function setUp() public {
        vm.warp(START_TS);

        walletArtist = vm.addr(walletArtistKey);
        farcasterArtist = vm.addr(farcasterArtistKey);

        wmon = new MockWMON();
        rewards = new MockRewardManager();

        // ---- deployment, in the order the deploy script must use ----
        registry = new LicenseRegistry(governance);
        sales = new SalesController(registry, IERC20(address(wmon)), governance, treasury);

        // Without this nothing can mint. It is the single easiest step to forget.
        vm.prank(governance);
        registry.setController(address(sales));

        subscription = new MusicSubscriptionV6(
            address(wmon), address(rewards), address(registry), treasury, oracle
        );
        profiles = new ProfileRegistry(governance);
        passport = new PassportNFTV4(address(wmon), oracle, treasury);
        referrals = new SubscriptionReferrals(
            IMusicSubscription(address(subscription)), IERC20(address(wmon)), governance, treasury
        );

        address[6] memory funded =
            [walletArtist, farcasterArtist, walletListener, farcasterListener, buyer, relayer];
        for (uint256 i = 0; i < funded.length; i++) {
            wmon.mint(funded[i], 100_000 ether);
            vm.startPrank(funded[i]);
            wmon.approve(address(subscription), type(uint256).max);
            wmon.approve(address(sales), type(uint256).max);
            wmon.approve(address(passport), type(uint256).max);
            wmon.approve(address(referrals), type(uint256).max);
            vm.stopPrank();
        }
    }

    // =====================================================================
    // EIP-712 signing, exactly as the app will do it
    // =====================================================================

    function _signedMint(uint256 artistKey, address artist, uint256 artistFid, string memory uri)
        internal
        view
        returns (SalesController.MintRequest memory req, bytes memory sig)
    {
        return _signedMintOn(sales, artistKey, artist, artistFid, uri);
    }

    /**
     * @dev Signs against a specific SalesController. The EIP-712 domain includes the verifying
     *      contract's address, so a signature produced for one deployment is rejected by another
     *      — which is why this has to be parameterised rather than always using `sales`.
     */
    function _signedMintOn(
        SalesController target,
        uint256 artistKey,
        address artist,
        uint256 artistFid,
        string memory uri
    ) internal view returns (SalesController.MintRequest memory req, bytes memory sig) {
        req = SalesController.MintRequest({
            artist: artist,
            artistFid: artistFid,
            uri: uri,
            maxCollectorEditions: 0,
            referrer: address(0),
            royaltyBps: 500,
            nftType: MUSIC,
            price: TRACK_PRICE,
            collectorPrice: 0,
            nonce: 1,
            deadline: block.timestamp + 1 hours
        });

        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "MintRequest(address artist,uint256 artistFid,string uri,uint32 maxCollectorEditions,address referrer,uint96 royaltyBps,uint8 nftType,uint256 price,uint256 collectorPrice,uint256 nonce,uint256 deadline)"
                ),
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
        );

        bytes32 digest =
            keccak256(abi.encodePacked("\x19\x01", target.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(artistKey, digest);
        sig = abi.encodePacked(r, s, v);
    }

    /**
     * @dev The whole point of `mintMasterFor`: the artist signs, the platform pays the gas, and
     *      the platform cannot mint in anybody's name without that signature.
     */
    function test_AWalletOnlyArtistMintsBySignatureAndTheRelayerPaysGas() public {
        (SalesController.MintRequest memory req, bytes memory sig) =
            _signedMint(walletArtistKey, walletArtist, 0, "ipfs://wallet-track");

        vm.prank(relayer);
        uint256 masterId = sales.mintMasterFor(req, sig);

        assertEq(registry.ownerOf(masterId), walletArtist, "the master belongs to the artist");
        assertEq(registry.getMaster(masterId).artistFid, 0, "no Farcaster account, recorded as 0");
        assertEq(registry.artistMasterCount(walletArtist), 1);
        assertEq(sales.priceOf(masterId, false), TRACK_PRICE, "pricing was set at mint");
    }

    function test_TheRelayerCannotMintWithoutTheArtistsSignature() public {
        (SalesController.MintRequest memory req,) =
            _signedMint(walletArtistKey, walletArtist, 0, "ipfs://x");

        // A signature from the wrong key — the platform trying to mint as the artist.
        (, bytes memory wrongSig) = _signedMint(farcasterArtistKey, walletArtist, 0, "ipfs://x");

        vm.prank(relayer);
        vm.expectRevert();
        sales.mintMasterFor(req, wrongSig);
    }

    function test_AMintSignatureCannotBeReplayed() public {
        (SalesController.MintRequest memory req, bytes memory sig) =
            _signedMint(walletArtistKey, walletArtist, 0, "ipfs://once");

        vm.prank(relayer);
        sales.mintMasterFor(req, sig);

        vm.prank(relayer);
        vm.expectRevert();
        sales.mintMasterFor(req, sig);
    }

    function test_AnExpiredMintSignatureIsRefused() public {
        (SalesController.MintRequest memory req, bytes memory sig) =
            _signedMint(walletArtistKey, walletArtist, 0, "ipfs://late");

        skip(2 hours);

        vm.prank(relayer);
        vm.expectRevert();
        sales.mintMasterFor(req, sig);
    }

    // =====================================================================
    // The journey, end to end, for somebody with only a wallet
    // =====================================================================

    /**
     * @dev Publish → get played → get paid, with no Farcaster account anywhere in the chain.
     *      This is the sequence that was impossible before this deployment.
     */
    function test_WalletOnlyArtistPublishesGetsPlayedAndGetsPaid() public {
        (SalesController.MintRequest memory req, bytes memory sig) =
            _signedMint(walletArtistKey, walletArtist, 0, "ipfs://wallet-track");
        vm.prank(relayer);
        uint256 masterId = sales.mintMasterFor(req, sig);

        // A listener with no Farcaster account subscribes. V5 reverted here.
        vm.prank(walletListener);
        subscription.subscribe(MusicSubscriptionV6.SubscriptionTier.MONTHLY, 0);
        assertTrue(subscription.hasActiveSubscription(walletListener));

        vm.prank(oracle);
        subscription.recordPlay(walletListener, masterId, 60);

        uint256 monthId = START_TS / 30 days;
        skip(30 days);
        subscription.finalizeMonthlyDistribution(monthId);

        uint256 before = wmon.balanceOf(walletArtist);
        vm.prank(walletArtist);
        subscription.claimArtistPayout(monthId);

        uint256 pool = (300 ether * 70) / 100;
        assertEq(wmon.balanceOf(walletArtist) - before, pool, "paid the full pool, no FID involved");
    }

    /// @dev And a name to be shown by, rather than `0x1a2b…f9c0`.
    function test_AWalletOnlyArtistGetsADisplayName() public {
        vm.prank(walletArtist);
        profiles.setProfile("Unify34", "ipfs://pfp", "makes noise");

        assertEq(profiles.displayNameOf(walletArtist), "Unify34");
        assertEq(profiles.ownerOfName("unify34"), walletArtist, "and it is theirs alone");
    }

    function test_AWalletOnlyUserMintsAPassport() public {
        vm.prank(walletListener);
        uint256 id = passport.mint(0, "MX", "Mexico", "LATAM", "North America", "ipfs://p");

        assertEq(passport.ownerOf(id), walletListener);
        assertEq(passport.getPassportByAddress(walletListener, "MX"), id);
    }

    // =====================================================================
    // Both audiences at once — the acceptance condition
    // =====================================================================

    function test_FarcasterAndWalletOnlyUsersCoexistAcrossTheWholeStack() public {
        // Two artists publish, one with a FID and one without.
        (SalesController.MintRequest memory reqW, bytes memory sigW) =
            _signedMint(walletArtistKey, walletArtist, 0, "ipfs://wallet");
        vm.prank(relayer);
        uint256 walletMaster = sales.mintMasterFor(reqW, sigW);

        (SalesController.MintRequest memory reqF, bytes memory sigF) =
            _signedMint(farcasterArtistKey, farcasterArtist, FID, "ipfs://farcaster");
        vm.prank(relayer);
        uint256 farcasterMaster = sales.mintMasterFor(reqF, sigF);

        // Two listeners subscribe, one of each kind.
        vm.prank(walletListener);
        subscription.subscribe(MusicSubscriptionV6.SubscriptionTier.MONTHLY, 0);
        vm.prank(farcasterListener);
        subscription.subscribe(MusicSubscriptionV6.SubscriptionTier.MONTHLY, FID);

        assertTrue(subscription.hasActiveSubscription(walletListener));
        assertTrue(subscription.hasActiveSubscription(farcasterListener));
        assertEq(subscription.fidToAddress(FID), farcasterListener, "the FID index is intact");
        assertEq(subscription.fidToAddress(0), address(0), "and index 0 is never written");

        // Each listens to the other's artist. Cross-audience, in both directions.
        vm.startPrank(oracle);
        subscription.recordPlay(walletListener, farcasterMaster, 60);
        subscription.recordPlay(farcasterListener, walletMaster, 60);
        vm.stopPrank();

        uint256 monthId = START_TS / 30 days;
        skip(30 days);
        subscription.finalizeMonthlyDistribution(monthId);

        uint256 pool = (600 ether * 70) / 100; // two subscriptions
        vm.prank(walletArtist);
        subscription.claimArtistPayout(monthId);
        vm.prank(farcasterArtist);
        subscription.claimArtistPayout(monthId);

        assertEq(wmon.balanceOf(walletArtist), 100_000 ether + pool / 2, "wallet artist paid half");
        assertEq(
            wmon.balanceOf(farcasterArtist), 100_000 ether + pool / 2, "farcaster artist paid half"
        );

        // Passports for both, same country — the V3 placeholder-FID collision.
        vm.prank(walletListener);
        passport.mint(0, "MX", "Mexico", "LATAM", "North America", "ipfs://p1");
        vm.prank(farcasterListener);
        passport.mint(FID, "MX", "Mexico", "LATAM", "North America", "ipfs://p2");
        assertTrue(passport.hasPassportByAddress(walletListener, "MX"));
        assertTrue(passport.hasPassportByAddress(farcasterListener, "MX"));
    }

    // =====================================================================
    // Buying, and the LiveRadioV3 compatibility surface
    // =====================================================================

    function test_ABuyerPurchasesALicenceAndTheArtistIsPaidImmediately() public {
        (SalesController.MintRequest memory req, bytes memory sig) =
            _signedMint(walletArtistKey, walletArtist, 0, "ipfs://track");
        vm.prank(relayer);
        uint256 masterId = sales.mintMasterFor(req, sig);

        uint256 artistBefore = wmon.balanceOf(walletArtist);

        vm.prank(buyer);
        uint256 licenseId = sales.purchase(masterId, false, "ipfs://licence");

        assertEq(registry.ownerOf(licenseId), buyer, "the buyer holds the licence");
        assertGt(wmon.balanceOf(walletArtist), artistBefore, "the artist was paid in the same tx");
        assertTrue(registry.hasValidLicense(buyer, masterId), "and LiveRadioV3 can see it");
    }

    /**
     * @dev LiveRadioV3 is live and gets repointed rather than redeployed, so it keeps calling
     *      V2's shapes. These are the two it uses; the app reads price from SalesController now.
     */
    function test_TheLiveRadioCompatibilitySurfaceStillAnswers() public {
        (SalesController.MintRequest memory req, bytes memory sig) =
            _signedMint(walletArtistKey, walletArtist, 0, "ipfs://radio");
        vm.prank(relayer);
        uint256 masterId = sales.mintMasterFor(req, sig);

        (, address originalArtist,,,,,,,,, bool active,,) = registry.masterTokens(masterId);
        assertEq(originalArtist, walletArtist, "the radio can resolve the artist to pay");
        assertTrue(active, "and sees the master as playable");

        assertFalse(registry.hasValidLicense(buyer, masterId), "no licence yet");
    }

    /// @dev Suspending a master must take it off the radio without touching anyone's property.
    function test_SuspendingAMasterTakesItOffAirButNobodyLosesTheirLicence() public {
        (SalesController.MintRequest memory req, bytes memory sig) =
            _signedMint(walletArtistKey, walletArtist, 0, "ipfs://track");
        vm.prank(relayer);
        uint256 masterId = sales.mintMasterFor(req, sig);

        vm.prank(buyer);
        sales.purchase(masterId, false, "ipfs://licence");

        vm.prank(governance);
        registry.setMasterSuspended(masterId, true, "dmca");

        (,,,,,,,,,, bool active,,) = registry.masterTokens(masterId);
        assertFalse(active, "the radio stops queueing it");
        assertTrue(registry.hasValidLicense(buyer, masterId), "the buyer keeps what they paid for");
    }

    // =====================================================================
    // Wiring mistakes the deploy script must not make
    // =====================================================================

    /// @dev The step most likely to be forgotten. Without it the whole deployment is inert.
    function test_NothingCanMintUntilTheControllerIsSet() public {
        LicenseRegistry fresh = new LicenseRegistry(governance);
        SalesController freshSales =
            new SalesController(fresh, IERC20(address(wmon)), governance, treasury);

        (SalesController.MintRequest memory req, bytes memory sig) =
            _signedMintOn(freshSales, walletArtistKey, walletArtist, 0, "ipfs://x");

        vm.prank(relayer);
        vm.expectRevert(LicenseRegistry.NotController.selector);
        freshSales.mintMasterFor(req, sig);

        vm.prank(governance);
        fresh.setController(address(freshSales));

        vm.prank(relayer);
        uint256 id = freshSales.mintMasterFor(req, sig);
        assertGt(id, 0, "and works the moment it is set");
    }

    /**
     * @dev A mint signature is bound to one SalesController, because the EIP-712 domain includes
     *      the verifying contract's address.
     *
     *      This matters for the redeploy-when-broken plan: it is a good safety property (a
     *      signature harvested from one deployment cannot be replayed against the next), but it
     *      also means **any signature already in flight becomes void the moment SalesController is
     *      replaced.** Re-deploying the controller requires the app to re-sign, not just repoint.
     */
    function test_AMintSignatureIsBoundToOneSalesControllerAndDoesNotCarryOver() public {
        (SalesController.MintRequest memory req, bytes memory sig) =
            _signedMint(walletArtistKey, walletArtist, 0, "ipfs://track");

        // A second deployment of the same code, wired to the same registry.
        SalesController redeployed =
            new SalesController(registry, IERC20(address(wmon)), governance, treasury);
        vm.prank(governance);
        registry.setController(address(redeployed));

        vm.prank(relayer);
        vm.expectRevert(SalesController.BadSignature.selector);
        redeployed.mintMasterFor(req, sig);

        // Re-signing against the new address works, with nothing else changed.
        (SalesController.MintRequest memory req2, bytes memory sig2) =
            _signedMintOn(redeployed, walletArtistKey, walletArtist, 0, "ipfs://track");
        vm.prank(relayer);
        assertGt(redeployed.mintMasterFor(req2, sig2), 0, "re-signing is all that is needed");
    }

    /// @dev A subscription pointed at the wrong registry cannot resolve an artist to pay.
    function test_ASubscriptionPointedAtTheWrongRegistryCannotRecordPlays() public {
        (SalesController.MintRequest memory req, bytes memory sig) =
            _signedMint(walletArtistKey, walletArtist, 0, "ipfs://track");
        vm.prank(relayer);
        uint256 masterId = sales.mintMasterFor(req, sig);

        vm.prank(walletListener);
        subscription.subscribe(MusicSubscriptionV6.SubscriptionTier.MONTHLY, 0);

        // Point it at an empty registry, as a mistyped deploy argument would.
        LicenseRegistry wrong = new LicenseRegistry(governance);
        subscription.setRegistry(address(wrong));

        vm.prank(oracle);
        vm.expectRevert();
        subscription.recordPlay(walletListener, masterId, 60);
    }

    /**
     * @dev An unfunded referral module accrues nothing and says so, rather than promising a
     *      commission it cannot pay. Seeding the pool is a deploy step, not a code change.
     */
    function test_AnUnfundedReferralPoolStillLetsPeopleSubscribe() public {
        vm.prank(governance);
        referrals.setTrustedRelayer(relayer);

        vm.prank(relayer);
        referrals.subscribeWithReferralFor(
            walletListener, IMusicSubscription.SubscriptionTier.MONTHLY, 0, farcasterListener
        );

        assertTrue(
            subscription.hasActiveSubscription(walletListener),
            "the subscription lands even though the pool is empty"
        );
        assertEq(referrals.referralBalance(farcasterListener), 0, "and nothing is falsely promised");
    }
}
