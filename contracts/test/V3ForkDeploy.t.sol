// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../v3/LicenseRegistry.sol";
import "../v3/SalesController.sol";
import "../v3/ProfileRegistry.sol";
import "../v3/SubscriptionReferrals.sol";
import "../MusicSubscriptionV6.sol";
import "../PassportNFTV4.sol";

interface IPlayOracle {
    function musicSubscription() external view returns (address);
    function setMusicSubscription(address) external;
    function owner() external view returns (address);
}

interface ILiveRadio {
    function setNFTContract(address) external;
    function owner() external view returns (address);
    function isLive() external view returns (bool);
    function nftContract() external view returns (address);
}

/**
 * @title The deployment, rehearsed against real mainnet state
 *
 * @dev `V3Integration.t.sol` proves the contracts agree with each other. This proves they agree
 *      with **Monad mainnet as it actually is right now** — the real WMON, the real reward
 *      manager, the real PlayOracleV3 and LiveRadioV3, and the real owner keys.
 *
 *      That gap is where this project's outages have lived. A mock reward manager always answers;
 *      the deployed one might not. A mock oracle accepts any owner; the real one has a specific
 *      one. Nothing in a self-contained suite can see either.
 *
 *      Costs nothing and sends nothing: `vm.createSelectFork` reads state, and `vm.prank` stands
 *      in for keys we do not use. This is the check the broadcast guard exists to make possible.
 *
 *      Skips itself when no RPC is reachable, so it never turns CI red for being offline.
 */
contract V3ForkDeployTest is Test {
    // --- live mainnet ---
    address constant WMON = 0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A;
    address constant REWARD_MANAGER = 0x056452a44d81AB502e24510b2e4FB1789C6faf85;
    address constant PLAY_ORACLE = 0xe210b31bBDf8B28B28c07D45E9B4FC886aafDCEf;
    address constant LIVE_RADIO = 0x042EDF80713e6822a891e4e8a0800c332B8200fd;
    address constant TREASURY = 0xf3b9D123E7Ac8C36FC9B5AB32135c665956725bA;
    address constant DEPLOYER = 0x8dF64bACf6b70F7787f8d14429b258B3fF958ec1;
    address constant SUBSCRIPTION_V5 = 0x5372aD0291a69c1EBc0BE2dc6DE9dab224045f19;

    bool forked;

    LicenseRegistry registry;
    SalesController sales;
    MusicSubscriptionV6 subscription;
    ProfileRegistry profiles;
    PassportNFTV4 passport;
    SubscriptionReferrals referrals;

    uint256 artistKey = 0xA11CE;
    address artist;
    address listener = makeAddr("listener");

    function setUp() public {
        artist = vm.addr(artistKey);

        try vm.createSelectFork("monad") {
            forked = true;
        } catch {
            forked = false;
            return;
        }

        // Deploy exactly as DeployV3Steps.s.sol does, in the same order, from the same key.
        vm.startPrank(DEPLOYER);
        registry = new LicenseRegistry(DEPLOYER);
        sales = new SalesController(registry, IERC20(WMON), DEPLOYER, TREASURY);
        registry.setController(address(sales));
        registry.setModerator(DEPLOYER);
        subscription =
            new MusicSubscriptionV6(WMON, REWARD_MANAGER, address(registry), TREASURY, PLAY_ORACLE);
        profiles = new ProfileRegistry(DEPLOYER);
        passport = new PassportNFTV4(WMON, PLAY_ORACLE, TREASURY);
        referrals = new SubscriptionReferrals(
            IMusicSubscription(address(subscription)), IERC20(WMON), DEPLOYER, TREASURY
        );
        vm.stopPrank();
    }

    modifier onlyForked() {
        if (!forked) {
            emit log("SKIPPED: no RPC. Set the `monad` endpoint in foundry.toml to run this.");
            return;
        }
        _;
    }

    // =====================================================================
    // The live contracts we are about to repoint
    // =====================================================================

    /**
     * @dev The plan says these two are one owner call each rather than a redeploy. If either
     *      owner were not the deployer, the whole cutover would stall after the money had
     *      already been spent on six contracts.
     */
    function test_WeActuallyOwnTheContractsTheCutoverRepoints() public onlyForked {
        assertEq(IPlayOracle(PLAY_ORACLE).owner(), DEPLOYER, "PlayOracleV3 owner is not our key");
        assertEq(ILiveRadio(LIVE_RADIO).owner(), DEPLOYER, "LiveRadioV3 owner is not our key");
    }

    /**
     * @dev The radio does **not** expose `hasValidLicense` — it *calls* it on whatever NFT
     *      contract it points at. An earlier version of this test asserted against a passthrough
     *      that does not exist, and reverted; a live call proved it reverts identically today
     *      against V2, so the fault was the test.
     *
     *      Worth recording as method: `INTEGRATION_MATRIX` probes for functions by looking for a
     *      4-byte selector in runtime bytecode. That finds outbound call sites as readily as
     *      dispatch entries, so a "present" result can mean "this contract calls it", not "this
     *      contract offers it". The matrix documents confirming a MISS with a live call; a HIT
     *      needs the same treatment.
     */
    function test_TheRadioStaysLiveAndPointsAtTheNewRegistry() public onlyForked {
        assertTrue(ILiveRadio(LIVE_RADIO).isLive(), "radio should be live before we touch it");
        assertEq(
            ILiveRadio(LIVE_RADIO).nftContract(),
            0xB9B3acf33439360B55d12429301E946f34f3B73F,
            "radio should still be on V2 before cutover"
        );

        vm.prank(DEPLOYER);
        ILiveRadio(LIVE_RADIO).setNFTContract(address(registry));

        assertEq(
            ILiveRadio(LIVE_RADIO).nftContract(),
            address(registry),
            "radio now reads the v3 registry"
        );
        assertTrue(ILiveRadio(LIVE_RADIO).isLive(), "and is still live");

        // What the radio will actually call on it. This is the compat surface, answered by the
        // registry itself rather than by a passthrough on the radio.
        assertFalse(registry.hasValidLicense(listener, 1), "registry answers hasValidLicense");
        (, address artistOut,,,,,,,,, bool active,,) = registry.masterTokens(1);
        assertEq(artistOut, address(0), "and answers masterTokens for an unminted id");
        assertFalse(active);
    }

    function test_TheOracleRepointsToV6() public onlyForked {
        assertEq(
            IPlayOracle(PLAY_ORACLE).musicSubscription(),
            SUBSCRIPTION_V5,
            "oracle should still point at V5 before cutover"
        );

        vm.prank(DEPLOYER);
        IPlayOracle(PLAY_ORACLE).setMusicSubscription(address(subscription));

        assertEq(
            IPlayOracle(PLAY_ORACLE).musicSubscription(),
            address(subscription),
            "oracle now points at V6"
        );
    }

    // =====================================================================
    // The real token and the real reward manager
    // =====================================================================

    /**
     * @dev The full journey against live WMON: a wallet-only artist mints by signature, a
     *      wallet-only listener subscribes, a play is recorded through the real oracle address,
     *      the month is finalized and the artist is paid — in real WMON, on forked mainnet.
     */
    function test_TheWholeJourneyWorksAgainstLiveMainnetState() public onlyForked {
        deal(WMON, listener, 1_000 ether);
        vm.prank(listener);
        IERC20(WMON).approve(address(subscription), type(uint256).max);

        // Mint, signed by the artist, relayed by the platform.
        SalesController.MintRequest memory req = SalesController.MintRequest({
            artist: artist,
            artistFid: 0,
            uri: "ipfs://fork-test",
            maxCollectorEditions: 0,
            referrer: address(0),
            royaltyBps: 500,
            nftType: 0,
            price: 50 ether,
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
        (uint8 v, bytes32 r, bytes32 sig_s) =
            vm.sign(artistKey, keccak256(abi.encodePacked("\x19\x01", sales.domainSeparator(), structHash)));

        vm.prank(DEPLOYER);
        uint256 masterId = sales.mintMasterFor(req, abi.encodePacked(r, sig_s, v));
        assertEq(registry.ownerOf(masterId), artist, "master minted to a wallet-only artist");

        // Subscribe with no Farcaster account.
        vm.prank(listener);
        subscription.subscribe(MusicSubscriptionV6.SubscriptionTier.MONTHLY, 0);
        assertTrue(subscription.hasActiveSubscription(listener));

        // A play, recorded by the real oracle address.
        vm.prank(PLAY_ORACLE);
        subscription.recordPlay(listener, masterId, 60);
        assertEq(subscription.artistLifetimePlays(artist), 1);

        // Close the month and pay out, in real WMON.
        uint256 monthId = block.timestamp / 30 days;
        vm.warp(block.timestamp + 31 days);
        vm.prank(DEPLOYER);
        subscription.finalizeMonthlyDistribution(monthId);

        uint256 before = IERC20(WMON).balanceOf(artist);
        vm.prank(artist);
        subscription.claimArtistPayout(monthId);

        assertEq(
            IERC20(WMON).balanceOf(artist) - before,
            (300 ether * 70) / 100,
            "artist paid 70% of the real WMON they earned"
        );
        assertGt(IERC20(WMON).balanceOf(TREASURY), 0, "treasury received its fee");
    }

    function _mintReq(string memory uri)
        internal
        view
        returns (SalesController.MintRequest memory)
    {
        return SalesController.MintRequest({
            artist: artist,
            artistFid: 0,
            uri: uri,
            maxCollectorEditions: 0,
            referrer: address(0),
            royaltyBps: 500,
            nftType: 0,
            price: 50 ether,
            collectorPrice: 0,
            nonce: uint256(keccak256(bytes(uri))),
            deadline: block.timestamp + 1 hours
        });
    }

    function _digest(SalesController.MintRequest memory req) internal view returns (bytes32) {
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
        return keccak256(abi.encodePacked("\x19\x01", sales.domainSeparator(), structHash));
    }

    /**
     * @dev BREAK 1, on live state: `isArtistEligible` reverted against the deployed V2 because it
     *      never implemented `artistMasterCount`. Against v3 it returns.
     */
    function test_ArtistEligibilityIsReachableOnMainnetState() public onlyForked {
        (bool eligible, uint256 masterCount, uint256 plays) = subscription.isArtistEligible(artist);
        assertEq(masterCount, 0);
        assertEq(plays, 0);
        assertFalse(eligible);
    }

    /// @dev The live reward manager must recognise our new subscription's reward type.
    function test_TheLiveRewardManagerAnswers() public onlyForked {
        uint256 rate = subscription.getCurrentMonthlyToursReward();
        emit log_named_uint("live ARTIST_MONTHLY TOURS rate", rate);
        // No assertion on the value — it follows a halving schedule. The point is that the call
        // does not revert, which is what BREAK 1 looked like from the outside.
    }

    /**
     * @dev **A gap the deploy plan did not list.** `ToursRewardManagerV2` gates `distributeReward`
     *      behind `authorizedDistributors`, and a freshly deployed V6 is not on that list — so
     *      `claimToursReward` reverts until `setDistributor(V6, true)` is called by its owner.
     *
     *      Live state says `authorizedDistributors(MusicSubscriptionV5) == false`, so this path
     *      has been dead on the current deployment too, independently of BREAK 1. Worth knowing
     *      before anyone reports it as a regression introduced by v3.
     *
     *      Asserted by running it, not by reading the probe — a selector in bytecode proves
     *      nothing about who may call it.
     */
    function test_ToursClaimNeedsTheRewardManagerToAuthoriseV6() public onlyForked {
        deal(WMON, listener, 1_000 ether);
        vm.prank(listener);
        IERC20(WMON).approve(address(subscription), type(uint256).max);
        vm.prank(listener);
        subscription.subscribe(MusicSubscriptionV6.SubscriptionTier.MONTHLY, 0);

        vm.prank(DEPLOYER);
        subscription.setEligibilityRequirements(0, 0);

        SalesController.MintRequest memory req = _mintReq("ipfs://tours-path");
        (uint8 v, bytes32 r, bytes32 sig_s) = vm.sign(artistKey, _digest(req));
        vm.prank(DEPLOYER);
        uint256 masterId = sales.mintMasterFor(req, abi.encodePacked(r, sig_s, v));

        vm.prank(PLAY_ORACLE);
        subscription.recordPlay(listener, masterId, 60);

        uint256 monthId = block.timestamp / 30 days;
        vm.warp(block.timestamp + 31 days);
        vm.prank(DEPLOYER);
        subscription.finalizeMonthlyDistribution(monthId);

        (bool eligible,,) = subscription.isArtistEligible(artist);
        assertTrue(eligible, "thresholds lowered, so eligibility is not the blocker here");

        // Unauthorised: the reward manager refuses.
        vm.prank(artist);
        vm.expectRevert();
        subscription.claimToursReward(monthId);

        emit log("CONFIRMED: claimToursReward reverts until rewardManager.setDistributor(V6,true)");
    }

    function test_PassportAndProfileWorkOnMainnetState() public onlyForked {
        deal(WMON, listener, 1_000 ether);
        vm.startPrank(listener);
        IERC20(WMON).approve(address(passport), type(uint256).max);
        uint256 id = passport.mint(0, "MX", "Mexico", "LATAM", "North America", "ipfs://p");
        vm.stopPrank();
        assertEq(passport.ownerOf(id), listener, "wallet-only passport on live state");

        vm.prank(artist);
        profiles.setProfile("Unify34", "", "");
        assertEq(profiles.displayNameOf(artist), "Unify34");
    }

    /// @dev Guards the deploy-order mistake, against real state this time.
    function test_TheDeployedSetIsWiredToEachOther() public view {
        if (!forked) return;
        assertEq(registry.controller(), address(sales));
        assertEq(address(sales.registry()), address(registry));
        assertEq(address(subscription.registry()), address(registry));
        assertEq(subscription.oracle(), PLAY_ORACLE);
        assertEq(subscription.treasury(), TREASURY);
        assertEq(registry.governance(), DEPLOYER);
    }
}
