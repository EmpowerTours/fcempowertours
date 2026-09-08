/**
 * Carries a share token from the link someone arrived on to the play that credits it.
 *
 * ## Why sessionStorage and not the URL
 *
 * The token enters on `/discover?via=<token>` — the deep link a cast's frame launches. The
 * player that ultimately fires `record-play` is on a different route, reached by client-side
 * navigation, and Next drops an unrecognised query param on the way. Reading
 * `window.location.search` at the point of play therefore finds nothing, and the whole chain
 * no-ops silently: the share is recorded, the play happens, nobody is credited.
 *
 * Capturing once on arrival and reading it back later survives every in-app navigation, and
 * the token dies with the tab, which is the right lifetime for "how this person got here".
 */

const KEY = "empowertours:via";

/**
 * Capture `?via=` from the current URL, if present. Safe to call on every render and on
 * every route; a later arrival with no token never clears an earlier one.
 */
export function captureVia(): void {
  if (typeof window === "undefined") return;
  try {
    const via = new URLSearchParams(window.location.search).get("via");
    if (!via) return;
    // Trust nothing from a URL: the server treats an unknown token as "no share", but a
    // hostile value should not reach it at all.
    if (!/^[a-f0-9]{6,64}$/i.test(via)) return;
    window.sessionStorage.setItem(KEY, via);
  } catch {
    // Private mode, blocked storage. Attribution is a nicety; never break a page for it.
  }
}

/** The token this visitor arrived with, if any. */
export function readVia(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.sessionStorage.getItem(KEY) || undefined;
  } catch {
    return undefined;
  }
}
