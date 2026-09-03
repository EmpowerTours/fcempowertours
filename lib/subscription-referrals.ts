import { encodeFunctionData, parseAbi, type Address, type Hex } from "viem";

/**
 * Routing a subscription through SubscriptionReferrals instead of straight at V6.
 *
 * Deployed at the cutover and never called: `execute-delegated` subscribes
 * directly on MusicSubscriptionV6, so the referral contract has never seen a
 * transaction and its pool has never been touched.
 *
 * ## The argument order is a trap
 *
 *   V6:        subscribeFor(address user,       uint256 userFid, uint8 tier)
 *   referrals: subscribeWithReferralFor(address subscriber, uint8 tier, uint256 userFid, address referrer)
 *
 * `tier` and `userFid` are SWAPPED between them. Both are numbers, so a
 * copy-paste of the V6 call encodes a Farcaster id as the tier and the tier as
 * a Farcaster id. `tools/verify-subscription-referral-abi.ts` pins these strings
 * against the Solidity so the two cannot drift apart unnoticed.
 *
 * ## Attribution binds once, on a first-ever subscription
 *
 * `_bindReferrer` reads V6's own `subscriptions[user].expiry` and refuses to
 * attribute anyone who has ever subscribed. So a referral that is not recorded
 * at signup can never be recorded later.
 */

export const SUBSCRIPTION_REFERRALS_ABI = parseAbi([
  "function subscribeWithReferralFor(address subscriber, uint8 tier, uint256 userFid, address referrer) external",
  // The self-serve variant. msg.sender IS the subscriber, which is the only way
  // _bindReferrer accepts an attribution while trustedRelayer is unset -- and
  // with a Safe per user, one relayer slot can never cover them.
  "function subscribeWithReferral(uint8 tier, uint256 userFid, address referrer) external",
  "function renewFor(address subscriber, uint8 tier, uint256 userFid) external",
  "function claimReferral() external",
  // Unpermissioned: anyone may top up the pool. Commission only accrues up to
  // what the pool backs, so an empty pool pays nobody -- silently.
  "function fund(uint256 amount) external",
  "function referralBalance(address referrer) view returns (uint256)",
  "function referrerOf(address subscriber) view returns (address)",
  "function referrerBps() view returns (uint96)",
  "function poolBalance() view returns (uint256)",
  "function unreserved() view returns (uint256)",
  "function trustedRelayer() view returns (address)",
]);

export const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000" as const;

/** The deployed router, or undefined when the app should subscribe directly. */
export function referralsAddress(): Address | undefined {
  const a = process.env.NEXT_PUBLIC_SUBSCRIPTION_REFERRALS;
  if (!a || !/^0x[0-9a-fA-F]{40}$/.test(a)) return undefined;
  if (a.toLowerCase() === ZERO_ADDRESS) return undefined;
  return a as Address;
}

export interface SubscribeRouting {
  /** Who the WMON allowance must be granted to. */
  spender: Address;
  /** Contract to call. */
  target: Address;
  data: Hex;
  /** True when the call went through the referral router. */
  routed: boolean;
}

/**
 * Build the subscribe call, through the referral router when one is configured.
 *
 * Falls back to V6 when the router is unset, so an unconfigured deployment keeps
 * subscribing exactly as before rather than failing. A referral that cannot be
 * recorded must never cost someone their subscription.
 */
export function buildSubscribeCall(input: {
  subscription: Address;
  subscriber: Address;
  userFid: bigint;
  tier: number;
  referrer?: Address | null;
}): SubscribeRouting {
  const router = referralsAddress();

  if (!router) {
    return {
      spender: input.subscription,
      target: input.subscription,
      routed: false,
      data: encodeFunctionData({
        abi: parseAbi([
          "function subscribeFor(address user, uint256 userFid, uint8 tier) external",
        ]),
        functionName: "subscribeFor",
        args: [input.subscriber, input.userFid, input.tier],
      }),
    };
  }

  // A self-referral is discarded by the contract, so normalising to zero here
  // only avoids a pointless argument.
  const referrer =
    input.referrer &&
    input.referrer.toLowerCase() !== input.subscriber.toLowerCase()
      ? input.referrer
      : (ZERO_ADDRESS as Address);

  return {
    // The router pulls the price from the caller, so the allowance is its own.
    spender: router,
    target: router,
    routed: true,
    data: encodeFunctionData({
      abi: SUBSCRIPTION_REFERRALS_ABI,
      functionName: "subscribeWithReferralFor",
      args: [input.subscriber, input.tier, input.userFid, referrer],
    }),
  };
}
