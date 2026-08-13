// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../MusicSubscriptionV5.sol";
import "../v3/SubscriptionReferrals.sol";

contract MockWMON is ERC20 {
    constructor() ERC20("Wrapped MON", "WMON") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev Only what `recordPlay` touches, so the real monthly distribution can be driven.
contract MockNFT {
    address public artist;

    constructor(address artist_) {
        artist = artist_;
    }

    function getMasterType(uint256) external pure returns (uint8) {
        return 0; // NFTType.MUSIC
    }

    function artistMasterCount(address) external pure returns (uint256) {
        return 10;
    }

    function masterTokens(uint256)
        external
        view
        returns (
            uint256,
            address,
            string memory,
            string memory,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            bool,
            uint8,
            uint96
        )
    {
        return (1, artist, "", "", 0, 0, 0, 0, 0, 0, true, 0, 0);
    }
}

/// @dev A referrer that cannot receive anything. Must never block a subscription.
contract HostileReferrer {
    receive() external payable {
        revert("no");
    }
}

contract SubscriptionReferralsTest is Test {
    MockWMON wmon;
    MusicSubscriptionV5 subs;
    SubscriptionReferrals refs;
    MockNFT nft;

    address governance = makeAddr("governance");
    address platformTreasury = makeAddr("platformTreasury");
    address oracle = makeAddr("oracle");
    address artist = makeAddr("artist");

    address subscriber = makeAddr("subscriber");
    address referrer = makeAddr("referrer");
    address stranger = makeAddr("stranger");

    uint256 constant MONTHLY = 300 ether;
    uint256 constant YEARLY = 3000 ether;

    /// 300 WMON * 10% platform fee * 3000bps = 9 WMON
    uint256 constant EXPECTED_MONTHLY_ACCRUAL = 9 ether;

    /// @dev Start well past epoch so `expiry`, month ids, and windows behave normally.
    ///      A literal rather than a `block.timestamp` read: under `via_ir = true` the
    ///      optimizer common-subexpression-eliminates TIMESTAMP across `vm.warp`, so a
    ///      value read before a warp can come back holding the post-warp time.
    uint256 constant START_TS = 365 days * 55;

    function setUp() public {
        vm.warp(START_TS);

        wmon = new MockWMON();
        nft = new MockNFT(artist);

        subs = new MusicSubscriptionV5(
            address(wmon),
            makeAddr("rewardManager"),
            address(nft),
            platformTreasury,
            oracle
        );

        refs = new SubscriptionReferrals(
            IMusicSubscription(address(subs)), IERC20(address(wmon)), governance, platformTreasury
        );

        // V5's platform fee tops the pool up automatically. Payouts never depend on it.
        subs.setTreasury(address(refs));

        wmon.mint(address(this), 1_000_000 ether);
        wmon.approve(address(refs), type(uint256).max);
        refs.fund(100_000 ether);

        address[3] memory funded = [subscriber, referrer, stranger];
        for (uint256 i; i < funded.length; ++i) {
            wmon.mint(funded[i], 100_000 ether);
            vm.prank(funded[i]);
            wmon.approve(address(refs), type(uint256).max);
        }
    }

    function _subscribe(address who, address ref) internal {
        vm.prank(who);
        refs.subscribeWithReferral(IMusicSubscription.SubscriptionTier.MONTHLY, 1234, ref);
    }

    // --------------------------------------------------------------- accrual

    function test_ReferrerIsBoundAndAccruesOnFirstPayment() public {
        _subscribe(subscriber, referrer);

        assertEq(refs.referrerOf(subscriber), referrer);
        assertEq(refs.referralBalance(referrer), EXPECTED_MONTHLY_ACCRUAL);
        assertEq(refs.totalOwed(), EXPECTED_MONTHLY_ACCRUAL);
    }

    function test_SubscriptionActuallyLandsInV5() public {
        _subscribe(subscriber, referrer);

        assertTrue(subs.hasActiveSubscription(subscriber));
        (, uint256 expiry,,,,) = IMusicSubscription(address(subs)).subscriptions(subscriber);
        assertEq(expiry, block.timestamp + 30 days);
        // V5 receives the *full* price — the router keeps nothing from the payment. The
        // commission comes out of this contract's own pool instead.
        assertEq(wmon.balanceOf(address(subs)), MONTHLY);
        assertEq(refs.poolBalance(), 100_000 ether);
    }

    function test_AccrualScalesWithTier() public {
        vm.prank(subscriber);
        refs.subscribeWithReferral(IMusicSubscription.SubscriptionTier.YEARLY, 1234, referrer);

        // 3000 WMON * 10% * 3000bps = 90 WMON
        assertEq(refs.referralBalance(referrer), 90 ether);
    }

    function test_AccruesAgainOnRenewal() public {
        _subscribe(subscriber, referrer);
        vm.warp(block.timestamp + 30 days);

        vm.prank(subscriber);
        refs.renew(IMusicSubscription.SubscriptionTier.MONTHLY, 1234);

        assertEq(refs.referralBalance(referrer), EXPECTED_MONTHLY_ACCRUAL * 2);
    }

    function test_NoAccrualWhenReferrerBpsIsZero() public {
        vm.prank(governance);
        refs.setReferrerBps(0);

        _subscribe(subscriber, referrer);

        assertEq(refs.referrerOf(subscriber), referrer); // still attributed
        assertEq(refs.referralBalance(referrer), 0); // but nothing owed
    }

    function test_NoReferrerMeansNoAccrual() public {
        _subscribe(subscriber, address(0));

        assertEq(refs.referrerOf(subscriber), address(0));
        assertEq(refs.totalOwed(), 0);
        assertTrue(subs.hasActiveSubscription(subscriber));
    }

    // -------------------------------------------------------------- attribution

    function test_SelfReferralIsDiscardedNotReverted() public {
        _subscribe(subscriber, subscriber);

        assertEq(refs.referrerOf(subscriber), address(0));
        assertEq(refs.totalOwed(), 0);
        assertTrue(subs.hasActiveSubscription(subscriber));
    }

    function test_ReferrerIsWriteOnce() public {
        _subscribe(subscriber, referrer);

        vm.warp(block.timestamp + 1 days);
        _subscribe(subscriber, stranger); // tries to switch attribution

        assertEq(refs.referrerOf(subscriber), referrer);
        assertEq(refs.referralBalance(stranger), 0);
        assertEq(refs.referralBalance(referrer), EXPECTED_MONTHLY_ACCRUAL * 2);
    }

    /// @dev Anti-poaching: someone already subscribed cannot be claimed by a link-sharer.
    function test_ExistingSubscriberCannotBeAttributed() public {
        // Subscribes directly against V5, never touching the router.
        vm.prank(subscriber);
        wmon.approve(address(subs), MONTHLY);
        vm.prank(subscriber);
        subs.subscribe(MusicSubscriptionV5.SubscriptionTier.MONTHLY, 1234);

        _subscribe(subscriber, referrer);

        assertEq(refs.referrerOf(subscriber), address(0));
        assertEq(refs.totalOwed(), 0);
    }

    function test_HostileReferrerCannotBlockSubscribing() public {
        address hostile = address(new HostileReferrer());
        _subscribe(subscriber, hostile);

        assertTrue(subs.hasActiveSubscription(subscriber));
        assertEq(refs.referralBalance(hostile), EXPECTED_MONTHLY_ACCRUAL);
    }

    // ------------------------------------------------------------------ window

    function test_AccrualStopsAfterTheWindow() public {
        _subscribe(subscriber, referrer);
        assertEq(refs.referralBalance(referrer), EXPECTED_MONTHLY_ACCRUAL);

        vm.warp(block.timestamp + 366 days);
        vm.prank(subscriber);
        refs.renew(IMusicSubscription.SubscriptionTier.MONTHLY, 1234);

        // Still subscribed, still attributed — but the introduction is no longer paid for.
        assertEq(refs.referralBalance(referrer), EXPECTED_MONTHLY_ACCRUAL);
        assertEq(refs.referrerOf(subscriber), referrer);
        assertTrue(subs.hasActiveSubscription(subscriber));
    }

    function test_AccrualContinuesInsideTheWindow() public {
        _subscribe(subscriber, referrer);

        vm.warp(block.timestamp + 364 days);
        vm.prank(subscriber);
        refs.renew(IMusicSubscription.SubscriptionTier.MONTHLY, 1234);

        assertEq(refs.referralBalance(referrer), EXPECTED_MONTHLY_ACCRUAL * 2);
    }

    // ---------------------------------------------------------------- claiming

    /// @dev The core guarantee: a shown balance is money already sitting in the pool.
    function test_ClaimIsImmediateAndNeverWaitsOnSettlement() public {
        _subscribe(subscriber, referrer);

        uint256 before = wmon.balanceOf(referrer);
        vm.prank(referrer);
        refs.claimReferral();

        assertEq(wmon.balanceOf(referrer) - before, EXPECTED_MONTHLY_ACCRUAL);
        assertEq(refs.referralBalance(referrer), 0);
        assertEq(refs.totalOwed(), 0);
    }

    function test_NothingToClaimReverts() public {
        vm.prank(stranger);
        vm.expectRevert(SubscriptionReferrals.NothingToClaim.selector);
        refs.claimReferral();
    }

    /**
     * The decoupling, stated as a test. A month that is never distributed — no plays, so
     * `finalizeMonthlyDistribution` reverts permanently — must have no effect whatsoever on
     * a referrer's ability to claim what they earned.
     */
    function test_ClaimWorksWhenTheMonthCanNeverBeFinalised() public {
        _subscribe(subscriber, referrer);

        uint256 monthId = START_TS / 30 days;
        vm.warp(START_TS + 31 days);

        // No plays were recorded, so artist distribution is permanently stuck for it.
        vm.expectRevert("No plays this month");
        subs.finalizeMonthlyDistribution(monthId);

        // The referrer is paid anyway. Separate concerns, separate failure modes.
        vm.prank(referrer);
        refs.claimReferral();
        assertEq(wmon.balanceOf(referrer), 100_000 ether + EXPECTED_MONTHLY_ACCRUAL);
    }

    /// @dev The monthly platform fee refills the pool with no keeper and no sync call.
    function test_MonthlyDistributionTopsThePoolUp() public {
        _subscribe(subscriber, referrer);
        vm.prank(oracle);
        subs.recordPlay(subscriber, 1, 60);

        uint256 monthId = START_TS / 30 days;
        uint256 poolBefore = refs.poolBalance();
        vm.warp(START_TS + 31 days);
        subs.finalizeMonthlyDistribution(monthId);

        // 10% of 300 WMON lands here and is immediately usable as commission backing.
        assertEq(refs.poolBalance(), poolBefore + 30 ether);
        assertEq(refs.unreserved(), poolBefore + 30 ether - EXPECTED_MONTHLY_ACCRUAL);
    }

    /// @dev An exhausted pool recovers on its own once a month distributes.
    function test_DrainedPoolRefillsFromDistributionAndResumesAccrual() public {
        uint256 free = refs.unreserved();
        vm.prank(governance);
        refs.withdrawUnreserved(free);

        // Underfunded: subscription succeeds, no commission promised.
        _subscribe(subscriber, referrer);
        assertEq(refs.referralBalance(referrer), 0);

        vm.prank(oracle);
        subs.recordPlay(subscriber, 1, 60);
        uint256 monthId = START_TS / 30 days;
        vm.warp(START_TS + 31 days);
        subs.finalizeMonthlyDistribution(monthId);

        assertEq(refs.poolBalance(), 30 ether, "refilled with no manual funding");

        // Accrual resumes by itself on the next renewal.
        vm.prank(subscriber);
        refs.renew(IMusicSubscription.SubscriptionTier.MONTHLY, 1234);
        assertEq(refs.referralBalance(referrer), EXPECTED_MONTHLY_ACCRUAL);

        vm.prank(referrer);
        refs.claimReferral();
    }

    function test_DoubleClaimPaysOnce() public {
        _subscribe(subscriber, referrer);

        vm.prank(referrer);
        refs.claimReferral();

        vm.prank(referrer);
        vm.expectRevert(SubscriptionReferrals.NothingToClaim.selector);
        refs.claimReferral();
    }

    // --------------------------------------------------------------- funding

    function test_FundingIncreasesTheUnreservedPool() public {
        uint256 before = refs.unreserved();
        wmon.mint(stranger, 500 ether);
        vm.prank(stranger);
        refs.fund(500 ether);

        assertEq(refs.poolBalance(), before + 500 ether);
        assertEq(refs.unreserved(), before + 500 ether);
    }

    function test_AccrualReservesAgainstThePool() public {
        uint256 before = refs.unreserved();
        _subscribe(subscriber, referrer);

        assertEq(refs.unreserved(), before - EXPECTED_MONTHLY_ACCRUAL);
        assertEq(refs.poolBalance(), 100_000 ether, "pool only shrinks on claim");
    }

    /**
     * An exhausted pool must degrade honestly: the subscription still succeeds, and no
     * commission is promised that the contract cannot pay.
     */
    function test_UnderfundedPoolSkipsAccrualButSubscriptionSucceeds() public {
        uint256 free = refs.unreserved(); // read before the prank; a call would consume it
        vm.prank(governance);
        refs.withdrawUnreserved(free); // drain it
        assertEq(refs.unreserved(), 0);

        vm.expectEmit(true, true, false, true, address(refs));
        emit SubscriptionReferrals.ReferralSkippedUnderfunded(
            referrer, subscriber, EXPECTED_MONTHLY_ACCRUAL, 0
        );
        _subscribe(subscriber, referrer);

        assertTrue(subs.hasActiveSubscription(subscriber), "payment must still go through");
        assertEq(refs.referralBalance(referrer), 0, "nothing promised that cannot be paid");
        assertEq(refs.totalOwed(), 0);
        assertEq(refs.referrerOf(subscriber), referrer, "attribution survives for later");
    }

    function test_PartiallyFundedPoolAccruesNothingRatherThanPartially() public {
        uint256 drain = refs.unreserved() - 5 ether; // read before the prank
        vm.prank(governance);
        refs.withdrawUnreserved(drain); // leave less than one commission

        _subscribe(subscriber, referrer);

        assertEq(refs.referralBalance(referrer), 0, "no partial promises");
        assertEq(refs.unreserved(), 5 ether);
    }

    function test_FundingZeroReverts() public {
        vm.expectRevert(SubscriptionReferrals.ZeroAmount.selector);
        refs.fund(0);
    }

    // --------------------------------------------------------------- solvency

    function test_GovernanceCannotWithdrawMoneyOwedToReferrers() public {
        _subscribe(subscriber, referrer);

        uint256 free = refs.unreserved();
        assertEq(free, 100_000 ether - EXPECTED_MONTHLY_ACCRUAL);

        vm.prank(governance);
        vm.expectRevert(
            abi.encodeWithSelector(
                SubscriptionReferrals.WouldBreakSolvency.selector,
                100_000 ether,
                EXPECTED_MONTHLY_ACCRUAL,
                free + 1
            )
        );
        refs.withdrawUnreserved(free + 1);
    }

    function test_GovernanceCanWithdrawTheUnreservedRemainder() public {
        _subscribe(subscriber, referrer);

        uint256 free = refs.unreserved();
        uint256 before = wmon.balanceOf(platformTreasury);
        vm.prank(governance);
        refs.withdrawUnreserved(free);

        assertEq(wmon.balanceOf(platformTreasury) - before, free);

        // The referrer is still paid after the withdrawal — the point of the invariant.
        vm.prank(referrer);
        refs.claimReferral();
        assertEq(wmon.balanceOf(referrer), 100_000 ether + EXPECTED_MONTHLY_ACCRUAL);
        assertEq(refs.poolBalance(), 0);
    }

    function test_StrangerCannotWithdraw() public {
        vm.prank(stranger);
        vm.expectRevert(SubscriptionReferrals.NotGovernance.selector);
        refs.withdrawUnreserved(1 ether);
    }

    /**
     * @dev The invariant the whole design rests on: every recorded commission is already
     *      backed by pool funds, at any rate and any volume — including volumes far past
     *      what the pool can cover, where accrual must stop rather than overshoot.
     */
    function testFuzz_OwedNeverExceedsThePool(uint8 rounds, uint96 bps, uint96 poolSize)
        public
    {
        rounds = uint8(bound(rounds, 1, 40));
        bps = uint96(bound(bps, 0, refs.MAX_REFERRER_BPS()));

        // Drain to a fuzzed starting pool, so underfunding is exercised, not just the
        // comfortable case.
        uint256 free = refs.unreserved(); // read before the prank
        vm.prank(governance);
        refs.withdrawUnreserved(free);
        uint256 seed = bound(poolSize, 0, 200 ether);
        if (seed > 0) refs.fund(seed);

        vm.prank(governance);
        refs.setReferrerBps(bps);

        for (uint256 i; i < rounds; ++i) {
            address s = address(uint160(0x5000 + i));
            wmon.mint(s, MONTHLY);
            vm.prank(s);
            wmon.approve(address(refs), MONTHLY);
            vm.prank(s);
            refs.subscribeWithReferral(
                IMusicSubscription.SubscriptionTier.MONTHLY, 1234, referrer
            );
            // Every subscription succeeds regardless of pool state.
            assertTrue(subs.hasActiveSubscription(s));
        }

        assertLe(refs.totalOwed(), refs.poolBalance(), "owed must always be backed");

        // And whatever was promised can actually be withdrawn.
        if (refs.totalOwed() > 0) {
            vm.prank(referrer);
            refs.claimReferral();
        }
    }

    // ------------------------------------------------------------- governance

    function test_ReferrerBpsIsCapped() public {
        vm.prank(governance);
        vm.expectRevert(
            abi.encodeWithSelector(
                SubscriptionReferrals.BpsTooHigh.selector, uint96(5_001), uint96(5_000)
            )
        );
        refs.setReferrerBps(5_001);
    }

    function test_ReferralWindowIsCapped() public {
        vm.prank(governance);
        vm.expectRevert(
            abi.encodeWithSelector(
                SubscriptionReferrals.WindowTooLong.selector, uint64(731 days), uint64(730 days)
            )
        );
        refs.setReferralWindow(731 days);
    }

    function test_GovernanceHandoffIsTwoStep() public {
        address newGov = makeAddr("newGov");

        vm.prank(governance);
        refs.setGovernance(newGov);
        assertEq(refs.governance(), governance); // not yet

        vm.prank(newGov);
        refs.acceptGovernance();
        assertEq(refs.governance(), newGov);
        assertEq(refs.pendingGovernance(), address(0));
    }

    function test_OnlyPendingCanAccept() public {
        vm.prank(governance);
        refs.setGovernance(makeAddr("newGov"));

        vm.prank(stranger);
        vm.expectRevert(SubscriptionReferrals.NotPendingGovernance.selector);
        refs.acceptGovernance();
    }

    function test_GovernanceCannotBeRenounced() public {
        vm.prank(governance);
        vm.expectRevert(SubscriptionReferrals.GovernanceCannotBeRenounced.selector);
        refs.renounceGovernance();
    }

    function test_StrangerCannotSetParameters() public {
        vm.prank(stranger);
        vm.expectRevert(SubscriptionReferrals.NotGovernance.selector);
        refs.setReferrerBps(100);
    }

    // ------------------------------------------------------------- allowances

    function test_NoStandingAllowanceIsLeftBehind() public {
        _subscribe(subscriber, referrer);
        assertEq(wmon.allowance(address(refs), address(subs)), 0);
    }
}
