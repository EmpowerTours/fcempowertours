/**
 * Remembering who referred a visitor, from `?ref=0x…` until they subscribe.
 *
 * Attribution is one-shot and unforgiving: `SubscriptionReferrals._bindReferrer`
 * refuses anyone whose V6 `expiry` is non-zero, so a referral not recorded on a
 * person's first-ever subscription can never be recorded afterwards. The gap
 * between clicking a link and paying is where that gets lost — people arrive,
 * look around, connect a wallet, and subscribe minutes later on a different
 * screen. So the referrer is persisted rather than read from the current URL.
 *
 * Deliberately not overwritten once set: a later visit through someone else's
 * link must not steal an attribution the contract would honour from the first.
 * First link wins, which is also the contract's own rule.
 */

const KEY = "empowertours:referrer";
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** Read `?ref=` and remember it. Safe to call on every page load. */
export function captureReferrerFromUrl(): void {
  if (typeof window === "undefined") return;
  try {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (!ref || !ADDRESS.test(ref)) return;
    // First one wins.
    if (window.localStorage.getItem(KEY)) return;
    window.localStorage.setItem(KEY, ref.toLowerCase());
  } catch {
    // A blocked or full localStorage must never break the page.
  }
}

/** The remembered referrer, or null. Never returns the visitor themselves. */
export function storedReferrer(self?: string | null): string | null {
  if (typeof window === "undefined") return null;
  try {
    const ref = window.localStorage.getItem(KEY);
    if (!ref || !ADDRESS.test(ref)) return null;
    if (self && ref.toLowerCase() === self.toLowerCase()) return null;
    return ref;
  } catch {
    return null;
  }
}

/** The link a referrer shares. */
export function referralLinkFor(address: string, origin?: string): string {
  const base =
    origin ||
    (typeof window !== "undefined" ? window.location.origin : "") ||
    "https://fcempowertours-production-6551.up.railway.app";
  return `${base}/?ref=${address}`;
}
