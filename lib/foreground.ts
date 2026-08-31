"use client";

/**
 * Wait until the page is actually in the foreground.
 *
 * On iOS every browser is WKWebView, including Chrome. Signing with a mobile
 * wallet deep-links out to the wallet app, so our page is backgrounded; the
 * WalletConnect relay can resolve signMessage() while the user is still over
 * there. A fetch() issued from a backgrounded WKWebView is terminated by the
 * system and rejects as `TypeError: Load failed` — no status, no response, and
 * the raw message lands in the user's error toast.
 *
 * So after any wallet round-trip, wait for visibility before touching the
 * network. Resolves immediately when already visible (every desktop case and
 * the Farcaster in-app path), so this costs nothing where it is not needed.
 */
export function awaitForeground(timeoutMs = 15_000): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  if (document.visibilityState === "visible") return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      document.removeEventListener("visibilitychange", onVisible);
      clearTimeout(timer);
      // One frame of slack: visibilitychange fires before the web view has
      // fully resumed, and a fetch in that gap can still be killed.
      setTimeout(resolve, 150);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") done();
    };
    // Never hang the mint forever waiting for a return that may not come.
    const timer = setTimeout(done, timeoutMs);
    document.addEventListener("visibilitychange", onVisible);
  });
}

/** True for a fetch that died at the transport level rather than returning a status. */
export function isTransportFailure(err: unknown): boolean {
  return err instanceof TypeError;
}
