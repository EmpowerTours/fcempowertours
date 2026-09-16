/**
 * Publish a press kit from the artist's OWN wallet.
 *
 * ## Why the artist signs, and not the platform
 *
 * `EPKRegistry` keys on `msg.sender`: `createEPK` writes `artistEPKs[msg.sender]` and `updateEPK`
 * requires that entry to exist. The app relays almost everything through a Safe, and a Safe
 * relaying this becomes the artist — which is not a hypothetical. On 2026-02-02 the platform Safe
 * registered itself this way and is still a registered artist carrying unify34's fid; the
 * contract gained `createEPKFor`/`updateEPKFor` three minutes later because of it.
 *
 * So the server pins the document (it holds the Pinata credential) and this signs the call (the
 * artist holds the address). Neither half can do the other's job, which is the point.
 *
 * ## The preflight is not ceremony
 *
 * `updateEPK` from the wrong wallet reverts `EPKDoesNotExist`, which surfaces to a user as an
 * unexplained wallet failure after they have already approved it. Reading `artistEPKs` first
 * costs one call and turns that into a sentence naming the address they need. A press kit is
 * exactly the case where somebody has several wallets — that is the whole reason this file
 * exists.
 */

import {
  createPublicClient,
  http,
  type Address,
  type Hex,
  parseAbi,
} from "viem";
import { activeChain } from "@/app/chains";
import { resolveWalletProvider } from "@/lib/wallet-provider";

const REGISTRY_ABI = parseAbi([
  "function artistEPKs(address) view returns (string ipfsCid, uint256 artistFid, uint256 createdAt, uint256 updatedAt, bool active)",
]);

interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

export interface PublishTx {
  to: string;
  data: string;
  functionName: string;
}

export interface PublishResult {
  txHash: string;
  ipfsCid: string;
}

function publicClient() {
  return createPublicClient({ chain: activeChain, transport: http() });
}

async function getProvider(): Promise<Eip1193Provider> {
  let sdk: unknown = null;
  try {
    ({ sdk } = await import("@farcaster/miniapp-sdk"));
  } catch {
    // Not inside a Farcaster host — the injected wallet below is the browser case.
  }
  const injected = (globalThis as { ethereum?: unknown }).ethereum;
  const result = await resolveWalletProvider(
    sdk as Parameters<typeof resolveWalletProvider>[0],
    injected,
  );
  if (!result.provider) {
    throw new Error(
      "No wallet available to sign. Open the app in Farcaster, or connect a wallet in the browser.",
    );
  }
  return result.provider as Eip1193Provider;
}

/**
 * Check the connected wallet can actually make this call, BEFORE asking it to.
 *
 * @returns null when fine, or a message naming what is wrong.
 */
export async function checkCanPublish(
  registry: Address,
  from: Address,
  isUpdate: boolean,
): Promise<string | null> {
  try {
    const r = (await publicClient().readContract({
      address: registry,
      abi: REGISTRY_ABI,
      functionName: "artistEPKs",
      args: [from],
    })) as readonly [string, bigint, bigint, bigint, boolean];

    const exists = Number(r[2]) !== 0;

    if (isUpdate && !exists) {
      return (
        `This wallet (${shorten(from)}) has no press kit registered, so it cannot update one. ` +
        `A press kit belongs to the address that created it — switch to that wallet and try again.`
      );
    }
    if (!isUpdate && exists) {
      return (
        `This wallet already has a press kit. Editing the existing one updates it; ` +
        `creating a second is not possible from the same address.`
      );
    }
    return null;
  } catch {
    // A failed read must not block a legitimate publish — the chain call is the real gate. Let it
    // through and let the wallet surface any revert.
    return null;
  }
}

/**
 * Send the registry call and wait until it is mined.
 *
 * `eth_sendTransaction` resolves when the wallet BROADCASTS, which says nothing about whether the
 * call succeeded — the trap `lib/artist-claim.ts` documents, where the UI announced success for a
 * transaction that reverted. So this waits for the receipt and throws on a reverted status.
 */
export async function publishEPKOnChain(
  tx: PublishTx,
  from: Address,
  ipfsCid: string,
  isUpdate: boolean,
): Promise<PublishResult> {
  const registry = tx.to as Address;

  const problem = await checkCanPublish(registry, from, isUpdate);
  if (problem) throw new Error(problem);

  const provider = await getProvider();

  const hash = (await provider.request({
    method: "eth_sendTransaction",
    params: [{ from, to: tx.to, data: tx.data }],
  })) as Hex;

  const receipt = await publicClient().waitForTransactionReceipt({
    hash,
    timeout: 120_000,
  });
  if (receipt.status !== "success") {
    throw new Error(
      `The registry rejected the transaction (${hash}). The document is pinned but the press kit has not changed.`,
    );
  }

  // Tell the server only now, so the read-through cache can never point at a CID the registry
  // does not hold. The server re-reads the chain rather than trusting this call.
  try {
    await fetch("/api/epk", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userAddress: from, ipfsCid, txHash: hash }),
    });
  } catch {
    // Non-fatal: the registry is the source of truth and already holds the CID. The cache is a
    // fallback for when the registry read fails, so a missed write costs nothing that matters.
  }

  return { txHash: hash, ipfsCid };
}

/** Turn a wallet or chain failure into something an artist can act on. */
export function explainPublishError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/user rejected|User denied|rejected the request/i.test(msg)) {
    return "Publishing cancelled in wallet.";
  }
  if (/EPKDoesNotExist/i.test(msg)) {
    return "This wallet has no press kit to update. Switch to the wallet that created it.";
  }
  if (/EPKAlreadyExists/i.test(msg)) {
    return "This wallet already has a press kit — edit it instead of creating a new one.";
  }
  if (/InvalidCID/i.test(msg)) {
    return "The document failed to pin. Try publishing again.";
  }
  if (/insufficient funds/i.test(msg)) {
    return "Not enough MON in this wallet to cover gas.";
  }
  return msg.split("\n")[0] || "Publishing failed";
}

function shorten(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
