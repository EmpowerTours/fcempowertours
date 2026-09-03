// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Test.sol";
import {SubscriptionReferralsV2, IMusicSubscription} from "./SubscriptionReferralsV2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IWMON {
    function deposit() external payable;
    function approve(address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

interface IV6 {
    function subscriptions(address)
        external
        view
        returns (uint256, uint256, bool, uint256, uint8);
}

/**
 * Does dropping the binding gate actually work, and what does it expose?
 *
 * The deployed SubscriptionReferrals binds an attribution only when msg.sender
 * is the subscriber or the single `trustedRelayer`. The app pays from a Safe PER
 * USER, so one relayer slot can never cover them: on the gasless path a referral
 * is silently dropped, and attribution is one-shot, so it can never be recovered.
 *
 * V2 drops that gate. These tests run against MAINNET STATE -- the real V6 and
 * the real WMON -- because the question is not whether the arithmetic is right
 * in isolation but whether it settles against contracts already deployed.
 *
 * Run: forge test --match-path test-mock/SubscriptionReferralsV2.fork.t.sol \
 *        --fork-url https://rpc.monad.xyz -vv
 */
contract SubscriptionReferralsV2ForkTest is Test {
    address constant V6 = 0xc7EDB67B59B8B89cF4E9bA9bd7b940052563611B;
    address constant WMON = 0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A;
    address constant TREASURY = 0xf3b9D123E7Ac8C36FC9B5AB32135c665956725bA;

    uint8 constant MONTHLY = 2;
    uint256 constant PRICE = 300 ether;
    /// 10% platform fee, 30% of that to the referrer.
    uint256 constant EXPECTED_COMMISSION = 9 ether;

    SubscriptionReferralsV2 router;

    address governance = makeAddr("governance");
    address referrer = makeAddr("referrer");
    address subscriber = makeAddr("subscriber");
    address safe = makeAddr("safe"); // the subscriber's own Safe: the payer
    address platform = makeAddr("platform");

    function setUp() public {
        // These only mean anything against real mainnet state. Without a fork
        // the deployed V6 is not there, so this SKIPS rather than fails: "could
        // not check" is not the same as "the check failed", and a suite that
        // goes red in the ordinary stop-gate teaches people to ignore it.
        if (V6.code.length == 0) {
            vm.skip(true);
            return;
        }

        router = new SubscriptionReferralsV2(
            IMusicSubscription(V6), IERC20(WMON), governance, TREASURY
        );
        _fundPool(90 ether);
    }

    function _wrapAndApprove(address who, uint256 amount) private {
        vm.deal(who, amount);
        vm.startPrank(who);
        IWMON(WMON).deposit{value: amount}();
        IWMON(WMON).approve(address(router), amount);
        vm.stopPrank();
    }

    function _fundPool(uint256 amount) private {
        _wrapAndApprove(platform, amount);
        vm.prank(platform);
        router.fund(amount);
    }

    /// The whole point: a Safe pays, and the referral still binds.
    function test_SafePaysAndReferralBinds() public {
        (, uint256 expiryBefore,,,) = IV6(V6).subscriptions(subscriber);
        assertEq(expiryBefore, 0, "subscriber must be new for attribution");

        _wrapAndApprove(safe, PRICE);
        vm.prank(safe);
        router.subscribeWithReferralFor(subscriber, IMusicSubscription.SubscriptionTier(MONTHLY), 42, referrer);

        assertEq(router.referrerOf(subscriber), referrer, "referral did not bind");
        assertEq(
            router.referralBalance(referrer),
            EXPECTED_COMMISSION,
            "commission is not 30% of the 10% platform fee"
        );

        (,, bool active,,) = IV6(V6).subscriptions(subscriber);
        assertTrue(active, "subscription did not land on V6");
        assertEq(IWMON(WMON).balanceOf(safe), 0, "the Safe should have paid in full");
    }

    /// The router forwards everything and keeps only its pool.
    function test_RouterKeepsNothingBeyondThePool() public {
        uint256 poolBefore = router.poolBalance();
        _wrapAndApprove(safe, PRICE);
        vm.prank(safe);
        router.subscribeWithReferralFor(subscriber, IMusicSubscription.SubscriptionTier(MONTHLY), 42, referrer);
        assertEq(router.poolBalance(), poolBefore, "the subscription must not touch the pool");
    }

    /// A claim can never fail for lack of funds, because accrual is fully backed.
    function test_ReferrerCanClaim() public {
        _wrapAndApprove(safe, PRICE);
        vm.prank(safe);
        router.subscribeWithReferralFor(subscriber, IMusicSubscription.SubscriptionTier(MONTHLY), 42, referrer);

        vm.prank(referrer);
        router.claimReferral();
        assertEq(IWMON(WMON).balanceOf(referrer), EXPECTED_COMMISSION);
        assertEq(router.referralBalance(referrer), 0);
    }

    /**
     * Stealing an attribution is possible and irrational.
     *
     * This is what the gate defended against, and why dropping it is defensible:
     * `_route` pulls the FULL price from msg.sender, so naming yourself as
     * somebody's referrer costs a whole subscription and returns the commission
     * on one. The attacker is down 291 WMON and the victim has a free month.
     */
    function test_AttributionTheftCostsFarMoreThanItPays() public {
        address attacker = makeAddr("attacker");
        address victim = makeAddr("victim");

        _wrapAndApprove(attacker, PRICE);
        uint256 before = IWMON(WMON).balanceOf(attacker);
        vm.prank(attacker);
        router.subscribeWithReferralFor(victim, IMusicSubscription.SubscriptionTier(MONTHLY), 7, attacker);

        uint256 spent = before - IWMON(WMON).balanceOf(attacker);
        uint256 earned = router.referralBalance(attacker);

        assertEq(spent, PRICE, "the attacker pays the whole subscription");
        assertEq(earned, EXPECTED_COMMISSION);
        assertGt(spent, earned * 30, "theft must cost far more than it pays");
    }

    /// Anti-poaching survives the change: a bound referrer is never replaced.
    function test_CannotRebindAnAlreadyReferredSubscriber() public {
        _wrapAndApprove(safe, PRICE);
        vm.prank(safe);
        router.subscribeWithReferralFor(subscriber, IMusicSubscription.SubscriptionTier(MONTHLY), 42, referrer);

        address poacher = makeAddr("poacher");
        _wrapAndApprove(poacher, PRICE);
        vm.prank(poacher);
        router.subscribeWithReferralFor(subscriber, IMusicSubscription.SubscriptionTier(MONTHLY), 42, poacher);

        assertEq(router.referrerOf(subscriber), referrer, "a bound referrer must never change");
        assertEq(router.referralBalance(poacher), 0, "a poacher must earn nothing");
    }

    /// An empty pool must not silently pay, and must not break the subscription.
    function test_UnfundedPoolPaysNobodyButStillSubscribes() public {
        SubscriptionReferralsV2 bare =
            new SubscriptionReferralsV2(IMusicSubscription(V6), IERC20(WMON), governance, TREASURY);

        address u2 = makeAddr("u2");
        address s2 = makeAddr("s2");
        vm.deal(s2, PRICE);
        vm.startPrank(s2);
        IWMON(WMON).deposit{value: PRICE}();
        IWMON(WMON).approve(address(bare), PRICE);
        bare.subscribeWithReferralFor(u2, IMusicSubscription.SubscriptionTier(MONTHLY), 9, referrer);
        vm.stopPrank();

        assertEq(bare.referralBalance(referrer), 0, "an empty pool must accrue nothing");
        (,, bool active,,) = IV6(V6).subscriptions(u2);
        assertTrue(active, "an unfunded pool must never cost somebody their subscription");
    }
}
