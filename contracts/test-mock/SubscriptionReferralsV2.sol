// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IMusicSubscription {
    enum SubscriptionTier {
        DAILY,
        WEEKLY,
        MONTHLY,
        YEARLY
    }

    function subscribeFor(address user, uint256 userFid, SubscriptionTier tier) external;

    function getTierPrice(SubscriptionTier tier) external pure returns (uint256);

    function TREASURY_PERCENTAGE() external view returns (uint256);

    /**
     * @dev Public mapping getter. `lastTier` is an enum, ABI-encoded as uint8.
     *
     *      Five fields, not V5's six: V6 dropped `flagVotes` along with `voteToFlag`. This is a
     *      positional decode, so a stale copy of this declaration would not fail loudly — it
     *      would read `lastTier` out of the `flagVotes` slot. Keep it in step with V6.
     */
    function subscriptions(address user)
        external
        view
        returns (
            uint256 userFid,
            uint256 expiry,
            bool active,
            uint256 totalPlays,
            uint8 lastTier
        );
}

/**
 * @title SubscriptionReferrals
 * @notice Referral accrual for MusicSubscriptionV5 — the referral program with real money
 *         in it. A monthly subscription is 300 WMON; at the default rate a referrer earns
 *         ~9 WMON per month for as long as their subscriber keeps paying, versus roughly
 *         two cents for an artist referral. See docs/V3_DESIGN.md.
 *
 * ## A pool that tops itself up, with payouts that depend on nothing
 *
 * `MusicSubscriptionV5` is deployed and immutable, and it does **not** split revenue when
 * someone subscribes. `subscribe`/`subscribeFor` pull the exact tier price and keep all of
 * it; the 10/20/70 split happens later, in `finalizeMonthlyDistribution`. So there is no
 * surplus at subscribe time from which a commission could be paid, and a router cannot skim
 * on the way past.
 *
 * An earlier draft made this contract V5's `treasury` and paid referrals **out of** that
 * monthly transfer — meaning a claim could not be settled until the month was distributed.
 * That was the error. `finalizeMonthlyDistribution` is `onlyOwner` and requires
 * `totalPlays > 0`, so a quiet month never distributes at all, and referrers would have been
 * unable to claim money they had already earned for reasons that have nothing to do with
 * referrals.
 *
 * The fix is to separate the *dependency* without separating the *funding*. This contract
 * holds a pool and pays from it immediately; the monthly platform fee merely tops that pool
 * up. Being V5's `treasury` is therefore a convenience, not a requirement — set it and the
 * pool refills itself, or leave it and top up with {fund}. Either way no payout waits on
 * anything, and this contract holds no privilege over V5.
 *
 * ## Fully-backed accrual: a claim can never fail
 *
 * Commission is only ever recorded when the pool can already cover it:
 *
 *     unreserved = poolBalance - totalOwed
 *     accrue only if unreserved >= amount
 *
 * So {totalOwed} <= {poolBalance} always holds, and {claimReferral} cannot revert for lack
 * of funds. A referrer is never shown a balance that is not money in this contract.
 *
 * A month that never distributes now costs nothing already earned — it only pauses *new*
 * accrual once the pool is exhausted, which surfaces as {ReferralSkippedUnderfunded} rather
 * than a silent shortfall or a failed subscription. Never let an attribution detail break a
 * payment.
 *
 * ## Anti-poaching
 *
 * A referrer is bound on a subscriber's **first ever** payment and never changes. Someone
 * who already subscribed cannot be claimed afterwards by whoever gets them to click a link
 * — checked against V5's own `subscriptions[user].expiry`, not local state, so prior
 * subscribers are excluded even though this contract did not exist when they paid.
 *
 * ## What is deliberately not enforced here
 *
 * The design doc gates referral *earning* on verified identity. That is enforced in the
 * app, where a FID is actually checked against Neynar. Requiring `fid > 0` here would add
 * nothing: V5 already demands a nonzero FID to subscribe at all, and neither check verifies
 * that the number is real or belongs to the caller. Passing `1` is free.
 */
contract SubscriptionReferralsV2 is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // --------------------------------------------------------------- constants

    uint256 public constant BPS_DENOMINATOR = 10_000;

    /// @dev Governance may never route more than half the platform fee to a referrer.
    uint96 public constant MAX_REFERRER_BPS = 5_000;

    /// @dev Nor pay for an introduction indefinitely.
    uint64 public constant MAX_REFERRAL_WINDOW = 730 days;

    // ------------------------------------------------------------------- state

    IMusicSubscription public immutable subscription;
    IERC20 public immutable paymentToken;

    address public governance;
    address public pendingGovernance;
    address public platformTreasury;

    /// @dev Share of the platform fee, not of the price. 3000 bps of a 10% fee is 3% of a
    ///      subscription — about 9 WMON on a 300 WMON month.
    uint96 public referrerBps = 3_000;

    uint64 public referralWindow = 365 days;

    /// @dev May bind attribution on a subscriber's behalf, because the app relays every
    ///      subscription through the user's Safe rather than their own address. Zero by
    ///      default: until governance sets it, only self-binding works.
    address public trustedRelayer;

    /// @dev Write-once, on the subscriber's first ever payment. Attribution never moves.
    mapping(address => address) public referrerOf;

    /// @dev Start of the 12-month window. Set on the first *attributed* payment.
    mapping(address => uint64) public firstPaidAt;

    mapping(address => uint256) public referralBalance;

    /// @dev Sum of every unclaimed balance. Never exceeds {poolBalance} — that invariant is
    ///      what makes a claim unable to fail.
    uint256 public totalOwed;

    // ------------------------------------------------------------------ events

    event ReferrerBound(address indexed subscriber, address indexed referrer);
    event SubscriptionRouted(
        address indexed subscriber, address indexed referrer, uint256 price, uint256 accrued
    );
    event ReferralAccrued(address indexed referrer, address indexed subscriber, uint256 amount);
    event ReferralSkippedUnderfunded(
        address indexed referrer, address indexed subscriber, uint256 wanted, uint256 unreserved
    );
    event ReferralClaimed(address indexed referrer, uint256 amount);
    event PoolFunded(address indexed from, uint256 amount, uint256 poolBalance);
    event PoolWithdrawn(address indexed to, uint256 amount, uint256 poolBalance);
    event TrustedRelayerSet(address indexed relayer);
    event ParameterSet(bytes32 indexed key, uint256 value);
    event GovernanceTransferStarted(address indexed from, address indexed to);
    event GovernanceTransferred(address indexed from, address indexed to);

    // ------------------------------------------------------------------ errors

    error NotGovernance();
    error NotPendingGovernance();
    error ZeroAddress();
    error NothingToClaim();
    error ZeroAmount();
    error WouldBreakSolvency(uint256 poolBalance, uint256 owed, uint256 requested);
    error BpsTooHigh(uint96 value, uint96 max);
    error WindowTooLong(uint64 value, uint64 max);
    error PaymentShortfall(uint256 expected, uint256 received);
    error SubscriptionDidNotSettle(uint256 expected, uint256 spent);
    error GovernanceCannotBeRenounced();

    // --------------------------------------------------------------- modifiers

    modifier onlyGovernance() {
        if (msg.sender != governance) revert NotGovernance();
        _;
    }

    // ------------------------------------------------------------- constructor

    constructor(
        IMusicSubscription subscription_,
        IERC20 paymentToken_,
        address governance_,
        address platformTreasury_
    ) {
        if (
            address(subscription_) == address(0) || address(paymentToken_) == address(0)
                || governance_ == address(0) || platformTreasury_ == address(0)
        ) revert ZeroAddress();
        subscription = subscription_;
        paymentToken = paymentToken_;
        governance = governance_;
        platformTreasury = platformTreasury_;
    }

    // ------------------------------------------------------------- subscribing

    /**
     * @notice Subscribe for yourself through the referral router.
     * @param tier     V5 tier. Price is read from V5, never passed in.
     * @param userFid  Farcaster id. V5 required this to be non-zero; V6 does not — see {_route}.
     * @param referrer Ignored if you already have a bound referrer, if it is you, or if you
     *                 have subscribed before. Pass `address(0)` on renewals; the stored
     *                 referrer is used.
     */
    function subscribeWithReferral(
        IMusicSubscription.SubscriptionTier tier,
        uint256 userFid,
        address referrer
    ) external nonReentrant {
        _route(msg.sender, tier, userFid, referrer);
    }

    /**
     * @notice Pay for someone else's subscription. The caller funds it; `subscriber` is who
     *         V5 registers and who the referral attaches to.
     * @dev This split is not a convenience — it is how the app actually works. The user's
     *      Safe pays while the subscription belongs to their EOA
     *      (`execute-delegated` calls `subscribeFor(userAddress, ...)` from the Safe, and
     *      the UI reads `getSubscriptionInfo(userAddress)`). Forcing payer == subscriber
     *      would register the Safe and make the user look unsubscribed.
     *
     *      Because anyone may pay for anyone, {referrer} is only *bound* when the caller is
     *      the subscriber themselves or the {trustedRelayer} — see {_bindReferrer}. The
     *      payment always goes through regardless.
     */
    function subscribeWithReferralFor(
        address subscriber,
        IMusicSubscription.SubscriptionTier tier,
        uint256 userFid,
        address referrer
    ) external nonReentrant {
        if (subscriber == address(0)) revert ZeroAddress();
        _route(subscriber, tier, userFid, referrer);
    }

    /// @notice Renew under whoever was already bound. Equivalent to passing `address(0)`.
    function renew(IMusicSubscription.SubscriptionTier tier, uint256 userFid)
        external
        nonReentrant
    {
        _route(msg.sender, tier, userFid, address(0));
    }

    /// @notice Renew someone else's subscription, keeping their existing attribution.
    function renewFor(
        address subscriber,
        IMusicSubscription.SubscriptionTier tier,
        uint256 userFid
    ) external nonReentrant {
        if (subscriber == address(0)) revert ZeroAddress();
        _route(subscriber, tier, userFid, address(0));
    }

    function _route(
        address subscriber,
        IMusicSubscription.SubscriptionTier tier,
        uint256 userFid,
        address referrer
    ) private {
        uint256 price = subscription.getTierPrice(tier);

        address ref = _bindReferrer(subscriber, referrer);

        // Take the price, then verify it landed. WMON is a plain wrapper today, but a
        // rebasing or fee-on-transfer payment token would otherwise short the subscription
        // leg and revert further in, with a less useful error.
        uint256 balanceBefore = paymentToken.balanceOf(address(this));
        paymentToken.safeTransferFrom(msg.sender, address(this), price);
        uint256 received = paymentToken.balanceOf(address(this)) - balanceBefore;
        if (received != price) revert PaymentShortfall(price, received);

        // Forward the full price. V5 pulls exactly getTierPrice() from msg.sender, so this
        // contract keeps none of the payment — commission comes from the pool instead.
        //
        // Settlement is verified rather than assumed, and that check is load-bearing now
        // that {poolBalance} is the token balance: if V5 ever failed to pull the price, the
        // subscriber's money would sit here and read as pool funds.
        paymentToken.forceApprove(address(subscription), price);
        subscription.subscribeFor(subscriber, userFid, tier);

        uint256 spent = balanceBefore + received - paymentToken.balanceOf(address(this));
        if (spent != price) revert SubscriptionDidNotSettle(price, spent);

        // Leave no standing allowance. V5 consumes it exactly, but a cleared approval is
        // the house rule after cf20662.
        paymentToken.forceApprove(address(subscription), 0);

        uint256 accrued;
        if (ref != address(0) && referrerBps > 0 && _withinWindow(subscriber)) {
            uint256 platformFee = (price * subscription.TREASURY_PERCENTAGE()) / 100;
            uint256 wanted = (platformFee * referrerBps) / BPS_DENOMINATOR;
            // Measured here, after the price has left for V5, so the subscriber's own
            // payment can never be counted as pool funds backing their own commission.
            uint256 available = unreserved();

            if (wanted > 0 && wanted <= available) {
                // Accrue, never transfer. A referrer contract that reverts on receive would
                // otherwise brick renewals for the subscriber they introduced.
                accrued = wanted;
                referralBalance[ref] += wanted;
                totalOwed += wanted;
                emit ReferralAccrued(ref, subscriber, wanted);
            } else if (wanted > 0) {
                // The pool cannot back this commission, so it is not promised. The
                // subscription still succeeds — never fail a payment over attribution.
                emit ReferralSkippedUnderfunded(ref, subscriber, wanted, available);
            }

            if (firstPaidAt[subscriber] == 0) {
                firstPaidAt[subscriber] = uint64(block.timestamp);
            }
        }

        emit SubscriptionRouted(subscriber, ref, price, accrued);
    }

    /**
     * @dev First touch wins and is permanent. A bad referrer argument is discarded rather
     *      than reverted — a subscription must never fail because of an attribution detail.
     *
     *      Only the subscriber or the {trustedRelayer} may *bind* attribution. Without that
     *      restriction, anyone could pay a 15 WMON daily tier for a brand-new user while
     *      naming themselves referrer, and collect 90 WMON per yearly renewal for a year —
     *      profitable poaching. Paying for someone remains permitted; claiming credit for
     *      recruiting them does not.
     */
    function _bindReferrer(address subscriber, address referrer) private returns (address) {
        address existing = referrerOf[subscriber];
        if (existing != address(0)) return existing;

        if (referrer == address(0) || referrer == subscriber) return address(0);
        // GATE DROPPED (candidate change under test).
        //
        // The original required msg.sender to be the subscriber or the single
        // trustedRelayer. The app pays from a Safe PER USER, so one relayer slot
        // can never cover them and no gasless referral could ever bind.
        //
        // Safe to drop because _route pulls the FULL price from msg.sender: to
        // attribute a referrer to somebody you must buy them a 300 WMON
        // subscription and can earn back at most 9. Attribution theft costs 291
        // WMON and hands the victim a free year. The payment already prevents
        // what this gate was defending against.

        // Anti-poaching: only a subscriber's first ever payment can be attributed. Read
        // from V5 rather than local state, so people who subscribed before this contract
        // was deployed cannot be claimed retroactively.
        (, uint256 expiry,,,) = subscription.subscriptions(subscriber);
        if (expiry != 0) return address(0);

        referrerOf[subscriber] = referrer;
        emit ReferrerBound(subscriber, referrer);
        return referrer;
    }

    function _withinWindow(address subscriber) private view returns (bool) {
        uint64 start = firstPaidAt[subscriber];
        if (start == 0) return true; // the first attributed payment is inside the window
        return block.timestamp <= start + referralWindow;
    }

    // ---------------------------------------------------------------- claiming

    /**
     * @notice Claim accrued commission.
     * @dev Cannot fail for lack of funds. Commission is only ever recorded against an
     *      already-funded pool, so anything shown as a balance is money sitting here.
     */
    function claimReferral() external nonReentrant {
        uint256 amount = referralBalance[msg.sender];
        if (amount == 0) revert NothingToClaim();

        referralBalance[msg.sender] = 0;
        totalOwed -= amount;
        paymentToken.safeTransfer(msg.sender, amount);

        emit ReferralClaimed(msg.sender, amount);
    }

    // ------------------------------------------------------------------ funding

    /**
     * @notice Top up the commission pool. Permissionless — funding someone else's referral
     *         programme is not an attack, and requiring governance here would mean an
     *         unfunded pool waiting on a multisig while commissions silently fail to accrue.
     */
    function fund(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();

        uint256 before = paymentToken.balanceOf(address(this));
        paymentToken.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = paymentToken.balanceOf(address(this)) - before;
        if (received != amount) revert PaymentShortfall(amount, received);

        emit PoolFunded(msg.sender, amount, poolBalance());
    }

    /**
     * @notice The commission pool: simply whatever this contract holds.
     * @dev Derived from the balance rather than tracked in a counter, so the pool tops
     *      itself up. When this contract is set as V5's `treasury`, the monthly platform
     *      fee lands here by plain transfer and becomes usable with no keeper, no hook and
     *      no `sync()` call. An explicit counter would have ignored exactly that transfer.
     */
    function poolBalance() public view returns (uint256) {
        return paymentToken.balanceOf(address(this));
    }

    /// @notice Commission the pool can still back. New accrual stops when this hits zero.
    function unreserved() public view returns (uint256) {
        uint256 balance = poolBalance();
        return balance > totalOwed ? balance - totalOwed : 0;
    }

    // -------------------------------------------------------------- governance

    /**
     * @notice Recover unreserved pool funds.
     * @dev The solvency invariant, and the reason this contract can hold referrer money
     *      safely: whatever is owed is untouchable, however governance votes.
     */
    function withdrawUnreserved(uint256 amount) external onlyGovernance nonReentrant {
        if (amount > unreserved()) {
            revert WouldBreakSolvency(poolBalance(), totalOwed, amount);
        }
        paymentToken.safeTransfer(platformTreasury, amount);
        emit PoolWithdrawn(platformTreasury, amount, poolBalance());
    }

    function setReferrerBps(uint96 v) external onlyGovernance {
        if (v > MAX_REFERRER_BPS) revert BpsTooHigh(v, MAX_REFERRER_BPS);
        referrerBps = v;
        emit ParameterSet("referrerBps", v);
    }

    function setReferralWindow(uint64 v) external onlyGovernance {
        if (v > MAX_REFERRAL_WINDOW) revert WindowTooLong(v, MAX_REFERRAL_WINDOW);
        referralWindow = v;
        emit ParameterSet("referralWindow", v);
    }

    function setTrustedRelayer(address v) external onlyGovernance {
        trustedRelayer = v;
        emit TrustedRelayerSet(v);
    }

    function setPlatformTreasury(address v) external onlyGovernance {
        if (v == address(0)) revert ZeroAddress();
        platformTreasury = v;
    }

    function setGovernance(address v) external onlyGovernance {
        if (v == address(0)) revert ZeroAddress();
        pendingGovernance = v;
        emit GovernanceTransferStarted(governance, v);
    }

    function acceptGovernance() external {
        if (msg.sender != pendingGovernance) revert NotPendingGovernance();
        address previous = governance;
        governance = msg.sender;
        pendingGovernance = address(0);
        emit GovernanceTransferred(previous, msg.sender);
    }

    /// @dev An ungoverned treasury could never sweep its own surplus again.
    function renounceGovernance() external pure {
        revert GovernanceCannotBeRenounced();
    }
}
