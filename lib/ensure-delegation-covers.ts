import { DELEGATION_PERMISSIONS } from "@/lib/delegation-covered";

/**
 * Make sure the STORED delegation actually holds the permission before relying
 * on it.
 *
 * Two lists agreeing is not enough. `delegationCovers` is a compile-time claim
 * about what a NEW delegation would carry; `hasPermission` on the server checks
 * what THIS user's existing delegation actually holds. Add a permission to the
 * shared list and every delegation created before that moment is now covered on
 * the client and rejected on the server -- the client skips the wallet prompt,
 * the server answers 403, and the user has nothing to click.
 *
 * That is exactly what happened when the radio actions were added: an
 * already-issued delegation had no radio_skip_random, and Skip Random became a
 * button that opened a wallet and did nothing.
 *
 * So: read the delegation, and if it is missing, unproven, or predates the
 * permission, create a fresh one. That costs one signature, once, instead of a
 * dead end.
 */
/** Anything longer than this and the wallet prompt is not coming. */
const SIGNATURE_TIMEOUT_MS = 90_000;

export async function ensureDelegationCovers(
  userAddress: string,
  action: string,
  authFor: (context: string) => Promise<Record<string, string>>,
  fid?: number,
  /** Called just before a wallet prompt, so the UI can say what is coming. */
  notify?: (message: string) => void,
): Promise<void> {
  let holds = false;
  try {
    const res = await fetch(
      `/api/delegation-status?address=${encodeURIComponent(userAddress)}`,
    );
    if (res.ok) {
      const data = await res.json();
      holds = Boolean(
        data?.delegation?.permissions?.includes(action) &&
          data.delegation.ownershipProven === true,
      );
    }
  } catch {
    // Unreachable status endpoint: fall through and recreate. A redundant
    // delegation costs a signature; a missing one costs the whole action.
  }

  if (holds) return;

  // Say so BEFORE the wallet opens. A prompt that appears with no explanation
  // reads as the app misbehaving, and on mobile the wallet is a different app
  // entirely -- the user may not even see it come to the foreground.
  notify?.("Approve the signature in your wallet to enable gasless actions.");

  // A wallet request that never surfaces used to hang forever, leaving a
  // spinner and no way back. On mobile the request is deep-linked to another
  // app and can simply not arrive; a stuck promise must become an error.
  const headers = await withTimeout(
    authFor("create-delegation"),
    "The wallet did not respond. Open your wallet app, then try again.",
  );

  const res = await fetch("/api/create-delegation", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify({
      userAddress,
      authMethod: fid ? "farcaster" : "wallet",
      fid,
      durationHours: 24,
      maxTransactions: 100,
      // The shared list, so a delegation created here covers everything the
      // client will later decline to prompt for.
      permissions: [...DELEGATION_PERMISSIONS],
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      data?.error || "Could not set up gasless transactions. Please try again.",
    );
  }
}

function withTimeout<T>(p: Promise<T>, message: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(message)), SIGNATURE_TIMEOUT_MS),
    ),
  ]);
}
