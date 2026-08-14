import {
  createPublicClient,
  encodeFunctionData,
  http,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { monadMainnet } from "@/app/chains";

/**
 * Reads go to the keyless public endpoint on purpose. This module runs in the
 * browser, so referencing the private RPC would ship its key in the bundle.
 */
const MONAD_PUBLIC_RPC = "https://rpc.monad.xyz";

let cachedPublicClient: ReturnType<typeof createPublicClient> | null = null;

function getPublicClient() {
  if (!cachedPublicClient) {
    cachedPublicClient = createPublicClient({
      chain: monadMainnet,
      transport: http(MONAD_PUBLIC_RPC),
    });
  }
  return cachedPublicClient;
}

/** Monad mainnet, chain 143 — where MusicSubscriptionV5 is deployed. */
const MONAD_CHAIN_ID_HEX = "0x8f";

const SUBSCRIPTION_ABI = parseAbi([
  "function claimArtistPayout(uint256 monthId) external",
  "function batchClaimArtistPayouts(uint256[] calldata monthIds) external",
  "function batchClaimToursRewards(uint256[] calldata monthIds) external",
]);

/** Minimal EIP-1193 surface — all we need is request(). */
interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

export interface ClaimArtistPayoutsArgs {
  /** Finalized, unclaimed months from /api/artist-claims. */
  monthIds: number[];
  /** Also claim the TOURS reward for those months. */
  claimTours: boolean;
  /** The artist wallet the payouts belong to; the signer must match it. */
  expectedAddress: string;
  subscriptionAddress: Address;
}

export interface ClaimArtistPayoutsResult {
  /** Hash of the WMON payout claim. Always present on success. */
  payoutTxHash: string;
  /** Hash of the TOURS claim, when one was requested and succeeded. */
  toursTxHash: string | null;
  /**
   * Set when the WMON claim succeeded but the TOURS claim did not. The WMON is
   * already settled at that point, so this is a warning, never a failure.
   */
  toursError: string | null;
}

/**
 * Claim artist payouts with the artist's OWN wallet.
 *
 * MusicSubscriptionV5.batchClaimArtistPayouts credits `msg.sender`, and plays
 * are attributed to the artist recorded on the master NFT — a plain wallet.
 * Routing the claim through the bot-owned Safe therefore made `msg.sender` the
 * Safe, which has zero plays, so the loop skipped every month and the call
 * reverted with "No payouts available". Verified on-chain 2026-08-12: month 688
 * had 19 plays / 210 WMON against wallet 0x33ffccb1 and 0 against its Safe.
 *
 * This is the same defect that was fixed for ListenerRewardPool on 2026-08-09;
 * see components/radio/ListenerRewardsClaim.tsx. There is no claimFor(address)
 * variant on either contract, so signing with the artist wallet is the only
 * route that produces the correct msg.sender.
 */
export async function claimArtistPayoutsFromEOA({
  monthIds,
  claimTours,
  expectedAddress,
  subscriptionAddress,
}: ClaimArtistPayoutsArgs): Promise<ClaimArtistPayoutsResult> {
  if (!subscriptionAddress) {
    throw new Error("Music subscription contract not configured");
  }
  if (!monthIds.length) {
    throw new Error("No months to claim");
  }

  const provider = await resolveWalletProvider();

  const accounts = (await provider.request({
    method: "eth_requestAccounts",
  })) as string[];
  const from = accounts?.[0];
  if (!from) throw new Error("Wallet returned no account");

  // The payout is bound to the artist address on-chain. Signing with a
  // different wallet would revert on "No payouts available" after costing gas,
  // so fail here with an explanation instead.
  if (from.toLowerCase() !== expectedAddress.toLowerCase()) {
    throw new Error(
      `Payouts belong to ${shorten(expectedAddress)} but the signed-in wallet is ${shorten(from)}. Switch wallets to claim.`,
    );
  }

  // The contract is on Monad mainnet; ask the host to switch if it isn't.
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: MONAD_CHAIN_ID_HEX }],
    });
  } catch {
    // Already on Monad, or the host doesn't support switching.
  }

  const monthIdsBigInt = monthIds.map((id) => BigInt(id));

  // Single-month claims use claimArtistPayout, which reverts with a specific
  // reason ("Month not finalized" / "Already claimed" / "No plays this month").
  // The batch variant collapses all of those into "No payouts available".
  const payoutData =
    monthIdsBigInt.length === 1
      ? encodeFunctionData({
          abi: SUBSCRIPTION_ABI,
          functionName: "claimArtistPayout",
          args: [monthIdsBigInt[0]],
        })
      : encodeFunctionData({
          abi: SUBSCRIPTION_ABI,
          functionName: "batchClaimArtistPayouts",
          args: [monthIdsBigInt],
        });

  let payoutTxHash: string;
  try {
    payoutTxHash = await sendAndConfirm(
      provider,
      from as Address,
      subscriptionAddress,
      payoutData as Hex,
    );
  } catch (e: unknown) {
    throw new Error(explainClaimError(e));
  }

  // TOURS is a separate contract call and cannot be batched with the WMON claim
  // now that there is no Safe to bundle them. Its failure must not be reported
  // as a failed claim: the WMON payout is confirmed mined by this point, so the
  // caller surfaces this as a warning alongside a successful claim.
  let toursTxHash: string | null = null;
  let toursError: string | null = null;
  if (claimTours) {
    try {
      toursTxHash = await sendAndConfirm(
        provider,
        from as Address,
        subscriptionAddress,
        encodeFunctionData({
          abi: SUBSCRIPTION_ABI,
          functionName: "batchClaimToursRewards",
          args: [monthIdsBigInt],
        }) as Hex,
      );
    } catch (e: unknown) {
      toursError = explainClaimError(e);
    }
  }

  return { payoutTxHash, toursTxHash, toursError };
}

/**
 * Send a transaction and wait until it is mined, throwing if it reverted.
 *
 * `eth_sendTransaction` resolves as soon as the wallet broadcasts, which says
 * nothing about whether the call succeeded. Reporting on that alone let the UI
 * announce "Claimed!" for a transaction that reverted on chain — the caller
 * cannot tell the difference without the receipt. A revert gives no reason
 * string in the receipt, so the hash is included for the explorer.
 */
async function sendAndConfirm(
  provider: Eip1193Provider,
  from: Address,
  to: Address,
  data: Hex,
): Promise<string> {
  const hash = (await provider.request({
    method: "eth_sendTransaction",
    params: [{ from, to, data }],
  })) as Hex;

  const receipt = await getPublicClient().waitForTransactionReceipt({
    hash,
    timeout: 120_000,
  });

  if (receipt.status !== "success") {
    throw new Error(`Transaction reverted on chain (${hash})`);
  }

  return hash;
}

/**
 * Prefer the Farcaster wallet, since every surface that shows these payouts
 * authenticates through the mini app context rather than wagmi. Fall back to an
 * injected wallet so the same components work in a normal browser.
 */
async function resolveWalletProvider(): Promise<Eip1193Provider> {
  try {
    const { sdk } = await import("@farcaster/miniapp-sdk");
    const provider = await sdk.wallet.getEthereumProvider();
    if (provider) return provider as Eip1193Provider;
  } catch {
    // Not running inside a Farcaster host.
  }

  const injected = (globalThis as { ethereum?: Eip1193Provider }).ethereum;
  if (injected) return injected;

  throw new Error("No wallet available to sign the claim");
}

/** Turn a raw revert into something an artist can act on. */
function explainClaimError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);

  if (/No payouts available|No plays this month/i.test(msg)) {
    return "This wallet has no unclaimed payouts for those months.";
  }
  if (/Already claimed/i.test(msg)) {
    return "Those payouts have already been claimed.";
  }
  if (/Month not finalized/i.test(msg)) {
    return "That month has not been finalized yet — payouts open once it is.";
  }
  if (/Not eligible for TOURS reward/i.test(msg)) {
    return "This wallet does not meet the TOURS eligibility requirements yet.";
  }
  if (/No TOURS rewards distributed/i.test(msg)) {
    return "No TOURS rewards were available for those months.";
  }
  if (/user rejected|User denied|rejected the request/i.test(msg)) {
    return "Claim cancelled in wallet.";
  }
  return msg.split("\n")[0] || "Claim failed";
}

function shorten(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
