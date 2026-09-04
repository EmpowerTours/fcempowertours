"use client";

import { awaitForeground } from "./foreground";
import { authHeaders } from "./quick-auth-client";
// From the dependency-free constants module, NOT lib/wallet-auth.ts — importing
// the server verifier here would pull Redis and node:crypto into the browser bundle.
import { WALLET_AUTH_HEADERS } from "./wallet-auth-headers";

/**
 * 🔐 WALLET AUTH (client side)
 *
 * Produces the headers that prove address ownership by wallet signature, for
 * users who are not in a Farcaster client. Pair with lib/wallet-auth.ts on the
 * server.
 *
 * Unlike Quick Auth, this costs a wallet prompt, so it is only worth doing for
 * actions that actually require proven ownership — the fund-moving ones.
 */

/** Matches wagmi's signMessageAsync({ message }). */
export type SignMessageFn = (args: { message: string }) => Promise<string>;

export interface WalletAuthOptions {
  address: string;
  signMessage: SignMessageFn;
  /** Must equal the `context` the server passes to authorizeUserAddress. */
  context: string;
}

/**
 * Fetch a nonce, sign the server-provided message, and return the headers.
 *
 * The message is taken verbatim from the server rather than rebuilt here — if
 * the two sides format it even slightly differently the signature recovers to a
 * different address and the failure is opaque.
 *
 * Returns {} when the wallet declines or anything goes wrong, so callers can
 * attach these opportunistically without a rejected prompt breaking the request.
 */
/**
 * Only one wallet signature at a time.
 *
 * Two requests overlapping is not a hypothetical: on 2026-09-03 the radio
 * asked for `radio-listen` and `create-delegation` three seconds apart, and the
 * server logs show one nonce consumed and the other never used. A wallet --
 * MetaMask on a phone especially -- surfaces a single prompt; the second is
 * dropped, silently. The user approves what they can see, and the request they
 * never saw fails with no explanation.
 *
 * Serialising costs a little latency when two requests genuinely coincide, and
 * removes a failure that looks exactly like a broken button.
 */
let signatureQueue: Promise<unknown> = Promise.resolve();

function queueSignature<T>(task: () => Promise<T>): Promise<T> {
  const run = signatureQueue.then(task, task);
  // Keep the chain alive even if this task rejects.
  signatureQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function walletAuthHeaders(
  options: WalletAuthOptions,
): Promise<Record<string, string>> {
  return queueSignature(() => buildWalletAuthHeaders(options));
}

async function buildWalletAuthHeaders({
  address,
  signMessage,
  context,
}: WalletAuthOptions): Promise<Record<string, string>> {
  try {
    const res = await fetch(
      `/api/auth/wallet-nonce?address=${encodeURIComponent(address)}&context=${encodeURIComponent(context)}`,
    );
    if (!res.ok) {
      console.warn("[WalletAuth] Nonce request failed:", res.status);
      return {};
    }

    const data = await res.json();
    if (!data?.success || !data.nonce || !data.message) {
      console.warn("[WalletAuth] Malformed nonce response");
      return {};
    }

    const signature = await signMessage({ message: data.message });

    // A mobile wallet signs in its own app, which backgrounds this page. The
    // caller fires its real request the moment we return, and a fetch from a
    // backgrounded iOS web view is killed outright — surfacing as the bare
    // string "Load failed". Hand back control only once we are visible again.
    await awaitForeground();

    return {
      [WALLET_AUTH_HEADERS.address]: address,
      [WALLET_AUTH_HEADERS.signature]: signature,
      [WALLET_AUTH_HEADERS.timestamp]: String(data.timestamp),
      [WALLET_AUTH_HEADERS.nonce]: data.nonce,
    };
  } catch (err: any) {
    console.warn("[WalletAuth] Could not build headers:", err?.message);
    return {};
  }
}

/**
 * Auth headers for a request, using whichever proof the user can actually
 * produce: a Farcaster Quick Auth token if one is available, otherwise a wallet
 * signature.
 *
 * Quick Auth is tried FIRST and wins outright, so inside a Farcaster client the
 * behaviour is exactly as before and no wallet prompt ever appears.
 *
 * Usage:
 *   headers: {
 *     'Content-Type': 'application/json',
 *     ...(await authHeadersWithWalletFallback({
 *       address, signMessage: signMessageAsync,
 *       context: 'execute-delegated:send_mon',
 *     })),
 *   }
 */
export async function authHeadersWithWalletFallback(
  options: WalletAuthOptions | null,
): Promise<Record<string, string>> {
  const farcaster = await authHeaders();
  if (farcaster.Authorization) return farcaster;

  if (!options?.address || !options.signMessage) return {};
  return walletAuthHeaders(options);
}
