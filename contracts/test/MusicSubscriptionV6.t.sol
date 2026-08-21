// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../MusicSubscriptionV6.sol";
import "../v3/LicenseRegistry.sol";
import "../v3/SubscriptionReferrals.sol";

contract MockWMON is ERC20 {
    constructor() ERC20("Wrapped MON", "WMON") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev Stands in for ToursRewardManagerV2. Returns a fixed rate; never the subject of a test.
contract MockRewardManager {
    uint256 public rate = 100 ether;

    function getCurrentReward(uint8) external view returns (uint256) {
        return rate;
    }

    function distributeReward(address, uint8) external view returns (uint256) {
        return rate;
    }
}

/**
 * @title MusicSubscriptionV6 tests
 * @dev The suite is built around one question: **can a listener with no Farcaster account use
 *      this app, without breaking anything for the listeners who have one?** Everything else
 *      here exists to prove the second half of that sentence.
 *
 *      The registry is the real `LicenseRegistry`, not a mock, because the whole point of V6 is
 *      that it talks to v3 correctly — a mock would only prove V6 agrees with my idea of v3.
 */
contract MusicSubscriptionV6Test is Test {
    MusicSubscriptionV6 sub;
    LicenseRegistry reg;
    MockWMON wmon;
    MockRewardManager rewards;

    address governance = makeAddr("governance");
    address controller = makeAddr("controller");
    address owner = address(this);
    address treasury = makeAddr("treasury");
    address oracle = makeAddr("oracle");
    address dao = makeAddr("dao");

    address artist = makeAddr("artist");
    address walletOnlyArtist = makeAddr("walletOnlyArtist");
    address farcasterUser = makeAddr("farcasterUser");
    address walletUser = makeAddr("walletUser");
    address otherWalletUser = makeAddr("otherWalletUser");
    address relayer = makeAddr("relayer");
    address stranger = makeAddr("stranger");

    uint256 constant FID = 868469;
    uint256 constant OTHER_FID = 213442;

    uint8 constant MUSIC = 0;
    uint8 constant ART = 1;

    /**
     * @dev Start well past epoch. At `block.timestamp = 1` the replay cooldown compares against
     *      a zeroed `lastPlayTime` and every first play looks like an instant repeat, and month
     *      ids collapse to 0 — both artefacts of the clock, not of the contract.
     */
    ///      Month ids are taken from this literal rather than by reading `block.timestamp`:
    ///      under `via_ir = true` the optimizer eliminates the common TIMESTAMP subexpression
    ///      across `vm.warp`/`skip`, so a value read *before* a skip can come back holding the
    ///      time from *after* it. Every test here stays inside START_TS's own 30-day window.
    uint256 constant START_TS = 365 days * 55;

    function setUp() public {
        vm.warp(START_TS);

        wmon = new MockWMON();
        rewards = new MockRewardManager();

        reg = new LicenseRegistry(governance);
        vm.prank(governance);
        reg.setController(controller);

        sub = new MusicSubscriptionV6(
            address(wmon),
            address(rewards),
            address(reg),
            treasury,
            oracle
        );

        // Everyone who ever pays in this suite.
        address[5] memory funded =
            [farcasterUser, walletUser, otherWalletUser, relayer, stranger];
        for (uint256 i = 0; i < funded.length; i++) {
            wmon.mint(funded[i], 100_000 ether);
            vm.prank(funded[i]);
            wmon.approve(address(sub), type(uint256).max);
        }
    }

    function _mintMaster(address who, uint256 fid, uint8 nftType) internal returns (uint256) {
        vm.prank(controller);
        return reg.mintMaster(who, fid, "ipfs://m", 0, address(0), 500, nftType);
    }

    function _subscribeMonthly(address user, uint256 fid) internal {
        vm.prank(user);
        sub.subscribe(MusicSubscriptionV6.SubscriptionTier.MONTHLY, fid);
    }

    // =====================================================================
    // The point of V6: a listener with no Farcaster account
    // =====================================================================

    /// @dev The V5 behaviour this replaces: `require(userFid > 0, "Invalid FID")`.
    function test_WalletOnlyUserCanSubscribe() public {
        _subscribeMonthly(walletUser, 0);

        assertTrue(sub.hasActiveSubscription(walletUser), "wallet-only user must be subscribed");

        (uint256 fid,, bool active,,,) = sub.getSubscriptionInfo(walletUser);
        assertEq(fid, 0, "no FID is recorded as 0, not as a placeholder");
        assertTrue(active);
    }

    function test_FarcasterUserCanStillSubscribe() public {
        _subscribeMonthly(farcasterUser, FID);

        assertTrue(sub.hasActiveSubscription(farcasterUser));
        (uint256 fid,,,,,) = sub.getSubscriptionInfo(farcasterUser);
        assertEq(fid, FID);
        assertEq(sub.fidToAddress(FID), farcasterUser, "FID index still works");
    }

    /**
     * @dev The collision the `userFid != 0` guard exists to prevent. Without it, both
     *      wallet-only users write `fidToAddress[0]` and the second silently displaces the
     *      first — the bug that made synthetic FIDs look attractive.
     */
    function test_TwoWalletOnlyUsersDoNotCollide() public {
        _subscribeMonthly(walletUser, 0);
        _subscribeMonthly(otherWalletUser, 0);

        assertTrue(sub.hasActiveSubscription(walletUser), "first user still subscribed");
        assertTrue(sub.hasActiveSubscription(otherWalletUser), "second user subscribed");
        assertEq(sub.fidToAddress(0), address(0), "FID 0 must never be indexed");
    }

    /// @dev Both audiences at once — the acceptance condition for this whole deployment.
    function test_FarcasterAndWalletUsersCoexist() public {
        _subscribeMonthly(farcasterUser, FID);
        _subscribeMonthly(walletUser, 0);
        _subscribeMonthly(otherWalletUser, 0);

        assertTrue(sub.hasActiveSubscription(farcasterUser));
        assertTrue(sub.hasActiveSubscription(walletUser));
        assertTrue(sub.hasActiveSubscription(otherWalletUser));
        assertEq(sub.fidToAddress(FID), farcasterUser, "the Farcaster index is undisturbed");
        assertEq(sub.totalActiveSubscribers(), 3);
    }

    function test_WalletOnlyUserCanBeSubscribedByTheRelayer() public {
        vm.prank(relayer);
        sub.subscribeFor(walletUser, 0, MusicSubscriptionV6.SubscriptionTier.MONTHLY);

        assertTrue(sub.hasActiveSubscription(walletUser), "subscription lands on the user");
        assertEq(wmon.balanceOf(walletUser), 100_000 ether, "the relayer paid, not the user");
    }

    function test_RelayerCannotSubscribeTheZeroAddress() public {
        vm.prank(relayer);
        vm.expectRevert("Invalid user");
        sub.subscribeFor(address(0), 0, MusicSubscriptionV6.SubscriptionTier.MONTHLY);
    }

    /// @dev A wallet-only listener who later joins Farcaster should not have to lose anything.
    function test_AWalletOnlyUserCanAttachAFidOnRenewal() public {
        _subscribeMonthly(walletUser, 0);
        _subscribeMonthly(walletUser, FID);

        (uint256 fid,,,,,) = sub.getSubscriptionInfo(walletUser);
        assertEq(fid, FID, "the FID attaches on renewal");
        assertEq(sub.fidToAddress(FID), walletUser, "and the index is written then");
    }

    /// @dev The reverse: relaying a renewal with no FID must not wipe an existing one.
    function test_RenewingWithoutAFidDoesNotClearIt() public {
        _subscribeMonthly(farcasterUser, FID);

        vm.prank(relayer);
        sub.subscribeFor(farcasterUser, 0, MusicSubscriptionV6.SubscriptionTier.MONTHLY);

        (uint256 fid,,,,,) = sub.getSubscriptionInfo(farcasterUser);
        assertEq(fid, FID, "a 0 must never clear a real FID");
    }

    function test_LookupByFidZeroReturnsNobody() public {
        _subscribeMonthly(walletUser, 0);

        (address who,,,,) = sub.getSubscriptionByFid(0);
        assertEq(who, address(0), "FID 0 must resolve to nobody, not to the latest subscriber");
    }

    // =====================================================================
    // The registry read — BREAK 2
    // =====================================================================

    /**
     * @dev Pins the `IMusicRegistry.Master` struct against the real one. Every field is given a
     *      distinct, recognisable value; if a field is added, removed or reordered in the
     *      registry, the decode shifts and at least one assertion fails. Without this test the
     *      failure mode is a plausible-but-wrong value — an artist address decoded from the
     *      referrer slot, and revenue paid to the wrong person.
     */
    function test_MasterStructShapeMatchesTheRegistry() public {
        address ref = makeAddr("referrerForShapeTest");
        vm.prank(controller);
        uint256 id = reg.mintMaster(artist, FID, "ipfs://shape", 7, ref, 500, ART);

        // Decoded through V6's OWN interface declaration against the real registry's ABI
        // encoding. Decoding through `LicenseRegistry.Master` here would be tautological — it
        // would check the registry against itself and never notice V6's copy drifting.
        IMusicRegistry.Master memory m = IMusicRegistry(address(reg)).getMaster(id);

        assertEq(m.artist, artist, "field 0: artist");
        assertEq(m.artistFid, FID, "field 1: artistFid");
        assertEq(uint256(m.createdAt), block.timestamp, "field 2: createdAt");
        assertEq(uint256(m.maxCollectorEditions), 7, "field 3: maxCollectorEditions");
        assertEq(uint256(m.collectorsMinted), 0, "field 4: collectorsMinted");
        assertEq(uint256(m.nftType), ART, "field 5: nftType");
        assertEq(m.referrer, ref, "field 6: referrer");
        assertEq(uint256(m.royaltyShareBps), 0, "field 7: royaltyShareBps");
        assertEq(m.royaltyShareSink, address(0), "field 8: royaltyShareSink");
    }

    function test_PlayResolvesTheArtistFromTheV3Registry() public {
        uint256 id = _mintMaster(artist, FID, MUSIC);
        _subscribeMonthly(walletUser, 0);

        vm.prank(oracle);
        sub.recordPlay(walletUser, id, 60);

        uint256 monthId = START_TS / 30 days;
        assertEq(sub.artistMonthlyPlays(monthId, artist), 1, "play credited to the right artist");
        assertEq(sub.artistLifetimePlays(artist), 1);
    }

    /// @dev The artist side never needed a FID. Proving it, since V5's docs claimed otherwise.
    function test_AWalletOnlyArtistEarnsPlays() public {
        uint256 id = _mintMaster(walletOnlyArtist, 0, MUSIC);
        _subscribeMonthly(walletUser, 0);

        vm.prank(oracle);
        sub.recordPlay(walletUser, id, 60);

        assertEq(sub.artistLifetimePlays(walletOnlyArtist), 1, "no FID anywhere in the chain");
    }

    function test_ArtMastersEarnNoStreamingRevenue() public {
        uint256 id = _mintMaster(artist, FID, ART);
        _subscribeMonthly(walletUser, 0);

        vm.prank(oracle);
        vm.expectRevert("Not a music NFT");
        sub.recordPlay(walletUser, id, 60);
    }

    function test_PlayingAMasterThatDoesNotExistReverts() public {
        _subscribeMonthly(walletUser, 0);

        vm.prank(oracle);
        vm.expectRevert(abi.encodeWithSelector(LicenseRegistry.MasterNotFound.selector, uint256(999)));
        sub.recordPlay(walletUser, 999, 60);
    }

    function test_OnlyTheOracleRecordsPlays() public {
        uint256 id = _mintMaster(artist, FID, MUSIC);
        _subscribeMonthly(walletUser, 0);

        vm.prank(stranger);
        vm.expectRevert("Only oracle can record plays");
        sub.recordPlay(walletUser, id, 60);
    }

    function test_UnsubscribedListenersCannotBeCredited() public {
        uint256 id = _mintMaster(artist, FID, MUSIC);

        vm.prank(oracle);
        vm.expectRevert("Invalid subscription");
        sub.recordPlay(walletUser, id, 60);
    }

    function test_PlayLimitsCarryOverFromV5() public {
        uint256 id = _mintMaster(artist, FID, MUSIC);
        _subscribeMonthly(walletUser, 0);

        vm.prank(oracle);
        vm.expectRevert("Play too short");
        sub.recordPlay(walletUser, id, 29);

        vm.prank(oracle);
        sub.recordPlay(walletUser, id, 30);

        vm.prank(oracle);
        vm.expectRevert("Replay too soon");
        sub.recordPlay(walletUser, id, 30);

        skip(5 minutes);
        vm.prank(oracle);
        sub.recordPlay(walletUser, id, 30);
        assertEq(sub.artistLifetimePlays(artist), 2);
    }

    // =====================================================================
    // BREAK 1 — artistMasterCount
    // =====================================================================

    /// @dev Against the deployed V2 this view reverted with empty data. It now returns.
    function test_ArtistEligibilityIsReachable() public {
        for (uint256 i = 0; i < 10; i++) _mintMaster(artist, FID, MUSIC);

        (bool eligible, uint256 masterCount, uint256 lifetimePlays) = sub.isArtistEligible(artist);
        assertEq(masterCount, 10, "the registry reports the real count");
        assertEq(lifetimePlays, 0);
        assertFalse(eligible, "still short on plays, but the question can now be asked");
    }

    function test_BurningAMasterReducesTheCount() public {
        uint256 id = _mintMaster(artist, FID, MUSIC);
        (, uint256 before,) = sub.isArtistEligible(artist);
        assertEq(before, 1);

        vm.prank(artist);
        reg.burn(id);

        (, uint256 afterBurn,) = sub.isArtistEligible(artist);
        assertEq(afterBurn, 0, "burn-and-remint must not inflate eligibility");
    }

    // =====================================================================
    // Money — the split, and the stranding fix
    // =====================================================================

    function test_TheSplitIsUnchangedFromV5() public {
        _subscribeMonthly(farcasterUser, FID);
        uint256 id = _mintMaster(artist, FID, MUSIC);

        vm.prank(oracle);
        sub.recordPlay(farcasterUser, id, 60);

        uint256 monthId = START_TS / 30 days;
        skip(30 days);
        sub.finalizeMonthlyDistribution(monthId);

        uint256 price = sub.getTierPrice(MusicSubscriptionV6.SubscriptionTier.MONTHLY);
        assertEq(wmon.balanceOf(treasury), (price * 10) / 100, "10% treasury");
        assertEq(sub.totalReserve(), (price * 20) / 100, "20% reserve");

        vm.prank(artist);
        sub.claimArtistPayout(monthId);
        assertEq(wmon.balanceOf(artist), (price * 70) / 100, "70% to the only artist played");
    }

    function test_PayoutIsProRataAcrossArtists() public {
        _subscribeMonthly(farcasterUser, FID);
        uint256 a = _mintMaster(artist, FID, MUSIC);
        uint256 b = _mintMaster(walletOnlyArtist, 0, MUSIC);

        vm.startPrank(oracle);
        sub.recordPlay(farcasterUser, a, 60);
        sub.recordPlay(farcasterUser, b, 60);
        skip(5 minutes);
        sub.recordPlay(farcasterUser, b, 60);
        vm.stopPrank();

        uint256 monthId = START_TS / 30 days;
        skip(30 days);
        sub.finalizeMonthlyDistribution(monthId);

        uint256 pool = (sub.getTierPrice(MusicSubscriptionV6.SubscriptionTier.MONTHLY) * 70) / 100;

        vm.prank(artist);
        sub.claimArtistPayout(monthId);
        vm.prank(walletOnlyArtist);
        sub.claimArtistPayout(monthId);

        assertEq(wmon.balanceOf(artist), pool / 3, "1 of 3 plays");
        assertEq(wmon.balanceOf(walletOnlyArtist), (pool * 2) / 3, "2 of 3 plays");
    }

    /**
     * @dev The V5 bug this fixes. `require(totalPlays > 0)` made a revenue-bearing month with
     *      no plays permanently unfinalizable, and there is no other exit for subscription
     *      revenue — 120 WMON is stuck in the live V5 across months 682 and 683 this way.
     */
    function test_AMonthWithRevenueButNoPlaysCanBeFinalized() public {
        _subscribeMonthly(walletUser, 0);
        uint256 monthId = START_TS / 30 days;
        skip(30 days);

        sub.finalizeMonthlyDistribution(monthId);

        (,,, bool finalized) = _monthly(monthId);
        assertTrue(finalized, "the month closes rather than trapping the funds");
    }

    function test_TheUnclaimableArtistPoolGoesToTheReserve() public {
        _subscribeMonthly(walletUser, 0);
        uint256 monthId = START_TS / 30 days;
        uint256 price = sub.getTierPrice(MusicSubscriptionV6.SubscriptionTier.MONTHLY);
        skip(30 days);

        sub.finalizeMonthlyDistribution(monthId);

        assertEq(wmon.balanceOf(treasury), (price * 10) / 100, "treasury still takes its 10%");
        assertEq(sub.totalReserve(), (price * 90) / 100, "reserve takes its 20% plus the dead 70%");

        // And it is genuinely recoverable, not merely relabelled.
        sub.withdrawReserveToDAO(dao, 0);
        assertEq(wmon.balanceOf(dao), (price * 90) / 100);
        assertEq(wmon.balanceOf(address(sub)), 0, "nothing stranded");
    }

    function test_FinalizingTwiceIsRejected() public {
        _subscribeMonthly(walletUser, 0);
        uint256 monthId = START_TS / 30 days;
        skip(30 days);

        sub.finalizeMonthlyDistribution(monthId);
        vm.expectRevert("Already finalized");
        sub.finalizeMonthlyDistribution(monthId);
    }

    function test_AMonthCannotBeFinalizedEarly() public {
        _subscribeMonthly(walletUser, 0);
        vm.expectRevert("Month not ended yet");
        sub.finalizeMonthlyDistribution(START_TS / 30 days);
    }

    function test_ClaimingTwiceIsRejected() public {
        uint256 monthId = _oneFinalizedMonthWithOnePlay();

        vm.prank(artist);
        sub.claimArtistPayout(monthId);

        vm.prank(artist);
        vm.expectRevert("No payouts available");
        sub.claimArtistPayout(monthId);
    }

    function test_AnArtistWithNoPlaysClaimsNothing() public {
        uint256 monthId = _oneFinalizedMonthWithOnePlay();

        vm.prank(walletOnlyArtist);
        vm.expectRevert("No payouts available");
        sub.claimArtistPayout(monthId);
    }

    function test_BatchClaimSkipsMonthsWithNothingOwed() public {
        uint256 monthId = _oneFinalizedMonthWithOnePlay();

        uint256[] memory months = new uint256[](3);
        months[0] = monthId - 1; // never had revenue
        months[1] = monthId;
        months[2] = monthId + 99; // not finalized

        vm.prank(artist);
        sub.batchClaimArtistPayouts(months);

        uint256 pool = (sub.getTierPrice(MusicSubscriptionV6.SubscriptionTier.MONTHLY) * 70) / 100;
        assertEq(wmon.balanceOf(artist), pool, "the one claimable month paid, the rest skipped");
    }

    // =====================================================================
    // The split: governable, bounded, and fixed once a month starts
    // =====================================================================

    function test_TheSplitStartsAtTheLaunchNumbers() public view {
        assertEq(sub.TREASURY_PERCENTAGE(), 10);
        assertEq(sub.RESERVE_PERCENTAGE(), 20);
        assertEq(sub.ARTIST_POOL_PERCENTAGE(), 70);
    }

    function test_GovernanceCanRetuneTheSplit() public {
        sub.setSplit(5, 15, 80);
        assertEq(sub.TREASURY_PERCENTAGE(), 5);
        assertEq(sub.RESERVE_PERCENTAGE(), 15);
        assertEq(sub.ARTIST_POOL_PERCENTAGE(), 80);
    }

    /// @dev The bound that is the whole point: the artist pool has a floor governance cannot cross.
    function test_TheArtistPoolHasAFloorGovernanceCannotCross() public {
        vm.expectRevert("Artist pool below the floor");
        sub.setSplit(20, 40, 40); // sums to 100, but starves artists

        // Exactly at the floor is allowed.
        sub.setSplit(20, 30, 50);
        assertEq(sub.ARTIST_POOL_PERCENTAGE(), 50);
    }

    function test_TreasuryAndReserveHaveCeilings() public {
        vm.expectRevert("Treasury above the cap");
        sub.setSplit(25, 5, 70);

        vm.expectRevert("Reserve above the cap");
        sub.setSplit(0, 45, 55);
    }

    function test_ASplitThatDoesNotTotalOneHundredIsRejected() public {
        vm.expectRevert("Split must total 100");
        sub.setSplit(10, 20, 60);

        vm.expectRevert("Split must total 100");
        sub.setSplit(10, 20, 80);
    }

    function test_StrangersCannotRetuneTheSplit() public {
        vm.prank(stranger);
        vm.expectRevert("Only owner or DAO");
        sub.setSplit(5, 15, 80);
    }

    /**
     * @dev The fairness rule. Subscribers pay under the terms in force when they subscribe, so a
     *      month that has already taken money settles on the split it started under — a later
     *      vote cannot reach back and re-cut it.
     */
    function test_ChangingTheSplitDoesNotRewriteAMonthAlreadyPaidInto() public {
        _subscribeMonthly(farcasterUser, FID);
        uint256 id = _mintMaster(artist, FID, MUSIC);
        vm.prank(oracle);
        sub.recordPlay(farcasterUser, id, 60);

        // Governance moves the split AFTER the money is in.
        sub.setSplit(20, 30, 50);

        uint256 monthId = START_TS / 30 days;
        skip(30 days);
        sub.finalizeMonthlyDistribution(monthId);

        uint256 price = sub.getTierPrice(MusicSubscriptionV6.SubscriptionTier.MONTHLY);
        assertEq(wmon.balanceOf(treasury), (price * 10) / 100, "settled at the OLD 10%");
        assertEq(sub.totalReserve(), (price * 20) / 100, "settled at the OLD 20%");

        vm.prank(artist);
        sub.claimArtistPayout(monthId);
        assertEq(wmon.balanceOf(artist), (price * 70) / 100, "artist keeps the 70% they signed up for");
    }

    function test_ANewSplitAppliesToTheNextMonth() public {
        // Month A under the launch split.
        _subscribeMonthly(farcasterUser, FID);
        uint256 monthA = START_TS / 30 days;

        sub.setSplit(5, 15, 80);

        // Month B starts fresh and takes the new split.
        skip(30 days);
        _subscribeMonthly(walletUser, 0);
        uint256 monthB = monthA + 1;

        (,, uint8 artistPctB,) = sub.monthSplit(monthB);
        assertEq(artistPctB, 80, "the new month recorded the new split");

        (,, uint8 artistPctA,) = sub.monthSplit(monthA);
        assertEq(artistPctA, 70, "the old month kept the old one");
    }

    /// @dev `monthlyStats` must stay a four-field tuple — three live app routes decode it by
    ///      position, so widening it would silently shift what they read.
    function test_MonthlyStatsTupleShapeIsUnchanged() public {
        _subscribeMonthly(walletUser, 0);
        (uint256 revenue, uint256 plays, uint256 distributed, bool finalized) =
            sub.monthlyStats(START_TS / 30 days);
        assertEq(revenue, 300 ether);
        assertEq(plays, 0);
        assertEq(distributed, 0);
        assertFalse(finalized);
    }

    // =====================================================================
    // Moderation — a flag must not reach money already earned
    // =====================================================================

    function test_AFlaggedListenerStopsAccruingPlays() public {
        uint256 id = _mintMaster(artist, FID, MUSIC);
        _subscribeMonthly(walletUser, 0);

        sub.flagAccount(walletUser, "bot");

        vm.prank(oracle);
        vm.expectRevert("Invalid subscription");
        sub.recordPlay(walletUser, id, 60);
    }

    /// @dev The invariant from DEPLOYMENT_PLAN: "A flag never blocks a payout."
    function test_AFlaggedArtistCanStillClaimWhatTheyAlreadyEarned() public {
        uint256 monthId = _oneFinalizedMonthWithOnePlay();

        sub.flagAccount(artist, "under review");

        vm.prank(artist);
        sub.claimArtistPayout(monthId);

        uint256 pool = (sub.getTierPrice(MusicSubscriptionV6.SubscriptionTier.MONTHLY) * 70) / 100;
        assertEq(wmon.balanceOf(artist), pool, "money already earned is not confiscable by a flag");
    }

    function test_UnflaggingRestoresALiveSubscription() public {
        _subscribeMonthly(walletUser, 0);
        sub.flagAccount(walletUser, "bot");
        assertFalse(sub.hasActiveSubscription(walletUser));

        sub.unflagAccount(walletUser);
        assertTrue(sub.hasActiveSubscription(walletUser), "an unflagged user gets their term back");
    }

    function test_UnflaggingDoesNotResurrectAnExpiredSubscription() public {
        _subscribeMonthly(walletUser, 0);
        sub.flagAccount(walletUser, "bot");
        skip(31 days);

        sub.unflagAccount(walletUser);
        assertFalse(sub.hasActiveSubscription(walletUser), "an expired term stays expired");
    }

    function test_OnlyOwnerOrDaoCanFlag() public {
        vm.prank(stranger);
        vm.expectRevert("Only owner or DAO");
        sub.flagAccount(walletUser, "nope");

        sub.setDAOTimelock(dao);
        vm.prank(dao);
        sub.flagAccount(walletUser, "dao can");
        assertTrue(sub.flaggedAccounts(walletUser));
    }

    // =====================================================================
    // emergencyWithdraw must not reach artist money
    // =====================================================================

    /// @dev V5's emergencyWithdraw had no such guard and could take the artist pool outright.
    function test_EmergencyWithdrawCannotTakeUnfinalizedRevenue() public {
        _subscribeMonthly(farcasterUser, FID);

        vm.expectRevert("Would take money owed to artists");
        sub.emergencyWithdraw(address(wmon), 1);
    }

    function test_EmergencyWithdrawCannotTakeAFinalizedArtistPool() public {
        uint256 monthId = _oneFinalizedMonthWithOnePlay();

        vm.expectRevert("Would take money owed to artists");
        sub.emergencyWithdraw(address(wmon), 1);

        // The artist can still be paid in full afterwards.
        vm.prank(artist);
        sub.claimArtistPayout(monthId);
        uint256 pool = (sub.getTierPrice(MusicSubscriptionV6.SubscriptionTier.MONTHLY) * 70) / 100;
        assertEq(wmon.balanceOf(artist), pool);
    }

    function test_EmergencyWithdrawRecoversAGenuineMistake() public {
        _subscribeMonthly(farcasterUser, FID);

        // Someone transfers WMON straight to the contract by mistake.
        vm.prank(stranger);
        wmon.transfer(address(sub), 42 ether);

        sub.emergencyWithdraw(address(wmon), 42 ether);
        assertEq(wmon.balanceOf(owner), 42 ether, "the surplus, and only the surplus, comes back");
    }

    function test_LockedWmonTracksEveryStage() public {
        uint256 price = sub.getTierPrice(MusicSubscriptionV6.SubscriptionTier.MONTHLY);

        _subscribeMonthly(farcasterUser, FID);
        assertEq(sub.lockedWmon(), price, "all of it is owed before finalization");

        uint256 id = _mintMaster(artist, FID, MUSIC);
        vm.prank(oracle);
        sub.recordPlay(farcasterUser, id, 60);

        uint256 monthId = START_TS / 30 days;
        skip(30 days);
        sub.finalizeMonthlyDistribution(monthId);
        assertEq(sub.lockedWmon(), (price * 90) / 100, "the treasury's 10% has left");
        assertEq(sub.lockedWmon(), wmon.balanceOf(address(sub)), "lock equals balance exactly");

        vm.prank(artist);
        sub.claimArtistPayout(monthId);
        assertEq(sub.lockedWmon(), (price * 20) / 100, "only the reserve remains owed");
        assertEq(sub.lockedWmon(), wmon.balanceOf(address(sub)));
    }

    // =====================================================================
    // Admin surface
    // =====================================================================

    function test_StrangersCannotMoveTheReserveOrTheConfig() public {
        vm.startPrank(stranger);
        vm.expectRevert("Only owner or DAO");
        sub.withdrawReserveToDAO(stranger, 0);
        vm.expectRevert();
        sub.setOracle(stranger);
        vm.expectRevert();
        sub.setRegistry(stranger);
        vm.stopPrank();
    }

    function test_PausingStopsSubscriptionsAndPlays() public {
        uint256 id = _mintMaster(artist, FID, MUSIC);
        _subscribeMonthly(walletUser, 0);

        sub.pause();

        vm.prank(otherWalletUser);
        vm.expectRevert("Contract is paused");
        sub.subscribe(MusicSubscriptionV6.SubscriptionTier.MONTHLY, 0);

        vm.prank(oracle);
        vm.expectRevert("Contract is paused");
        sub.recordPlay(walletUser, id, 60);

        sub.unpause();
        vm.prank(otherWalletUser);
        sub.subscribe(MusicSubscriptionV6.SubscriptionTier.MONTHLY, 0);
        assertTrue(sub.hasActiveSubscription(otherWalletUser));
    }

    function test_TierPricesAndDurationsAreUnchanged() public view {
        assertEq(sub.getTierPrice(MusicSubscriptionV6.SubscriptionTier.DAILY), 15 ether);
        assertEq(sub.getTierPrice(MusicSubscriptionV6.SubscriptionTier.WEEKLY), 75 ether);
        assertEq(sub.getTierPrice(MusicSubscriptionV6.SubscriptionTier.MONTHLY), 300 ether);
        assertEq(sub.getTierPrice(MusicSubscriptionV6.SubscriptionTier.YEARLY), 3000 ether);

        assertEq(sub.getTierDuration(MusicSubscriptionV6.SubscriptionTier.DAILY), 1 days);
        assertEq(sub.getTierDuration(MusicSubscriptionV6.SubscriptionTier.WEEKLY), 7 days);
        assertEq(sub.getTierDuration(MusicSubscriptionV6.SubscriptionTier.MONTHLY), 30 days);
        assertEq(sub.getTierDuration(MusicSubscriptionV6.SubscriptionTier.YEARLY), 365 days);
    }

    /**
     * @dev Constraint C1 in INTEGRATION_MATRIX: `SubscriptionReferrals` calls four things on
     *      the subscription contract, and V6 must keep every one of them intact.
     *
     *      This drives V6 through `SubscriptionReferrals`' own `IMusicSubscription` interface
     *      rather than a hand-copied list of selectors. The interface is the real declaration
     *      the referrals module compiles against, so a signature drifting out of step fails
     *      here — and `subscriptions` is checked by value, not just for presence, because it is
     *      a positional decode that would otherwise read a neighbouring field.
     */
    function test_SubscriptionReferralsInterfaceStillBindsToV6() public {
        IMusicSubscription iface = IMusicSubscription(address(sub));

        assertEq(iface.TREASURY_PERCENTAGE(), 10, "C1: TREASURY_PERCENTAGE");
        assertEq(
            iface.getTierPrice(IMusicSubscription.SubscriptionTier.MONTHLY),
            300 ether,
            "C1: getTierPrice"
        );

        // C1: subscribeFor, and specifically the userFid = 0 path the matrix flagged.
        vm.prank(relayer);
        iface.subscribeFor(walletUser, 0, IMusicSubscription.SubscriptionTier.MONTHLY);

        // C1: subscriptions(address). The referrals module reads field 1 (expiry) to decide
        // whether a subscription is live, so assert the decode lands on the right field.
        (uint256 fid, uint256 expiry, bool active, uint256 plays, uint8 lastTier) =
            iface.subscriptions(walletUser);
        assertEq(fid, 0, "field 0: userFid");
        assertEq(expiry, block.timestamp + 30 days, "field 1: expiry - the one referrals reads");
        assertTrue(active, "field 2: active");
        assertEq(plays, 0, "field 3: totalPlays");
        assertEq(lastTier, uint8(MusicSubscriptionV6.SubscriptionTier.MONTHLY), "field 4: lastTier");
    }

    // =====================================================================
    // helpers
    // =====================================================================

    function _oneFinalizedMonthWithOnePlay() internal returns (uint256 monthId) {
        _subscribeMonthly(farcasterUser, FID);
        uint256 id = _mintMaster(artist, FID, MUSIC);

        vm.prank(oracle);
        sub.recordPlay(farcasterUser, id, 60);

        monthId = START_TS / 30 days;
        skip(30 days);
        sub.finalizeMonthlyDistribution(monthId);
    }

    function _monthly(uint256 monthId)
        internal
        view
        returns (uint256 revenue, uint256 plays, uint256 distributed, bool finalized)
    {
        return sub.monthlyStats(monthId);
    }
}
