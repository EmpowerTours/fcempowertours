"use client";

/**
 * Make sure the user's Safe is an authorised minter BEFORE the mint request.
 *
 * Registration is a real on-chain write. execute-delegated will do it for you
 * (ensureUserSafeRegistered runs inside executeTransaction), but bundled that
 * way a first-time mint becomes two sequential chain operations inside one HTTP
 * request — registration, then the mint — each waiting on a user-operation
 * receipt. The browser abandons the connection long before that returns, and
 * fetch rejects with a bare TypeError the user sees as "Load failed".
 *
 * Splitting registration into its own request keeps each call to one chain
 * operation, which is the difference between finishing and timing out.
 *
 * The state read is unauthenticated, so the wallet is only asked to sign when
 * registration is genuinely needed — once per Safe, not once per mint.
 */
export async function ensureSafeRegistered(
  walletAddress: string,
  authFor: (context: string) => Promise<Record<string, string>>,
): Promise<void> {
  let needsRegistration = true;
  try {
    const res = await fetch(
      `/api/user-safe?address=${encodeURIComponent(walletAddress)}`,
    );
    if (res.ok) {
      const info = await res.json();
      needsRegistration = info?.isRegisteredAsMinter !== true;
    }
  } catch {
    // Could not read the state. Fall through and register: the call is
    // idempotent server-side and returns 'already_registered' when it is not
    // needed, so a redundant attempt is far cheaper than a skipped one.
  }

  if (!needsRegistration) return;

  const res = await fetch("/api/register-user-safe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authFor("register-user-safe")),
    },
    body: JSON.stringify({ userAddress: walletAddress }),
  });

  if (!res.ok) {
    // Do NOT swallow this. Proceeding lands in the bundled slow path that this
    // whole function exists to avoid, and the user gets a timeout instead of a
    // sentence telling them what happened.
    const detail = await res.json().catch(() => null);
    if (res.status === 401) {
      throw new Error(
        "Could not verify you own this wallet. Approve the signature request to set up your account, then try again.",
      );
    }
    throw new Error(
      detail?.error || "Could not set up your Safe for minting. Please try again.",
    );
  }
}
