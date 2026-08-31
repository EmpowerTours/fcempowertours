import { isTransportFailure } from "./foreground";

/**
 * Turn a thrown mint error into something a user can act on.
 *
 * The important case is a transport failure. fetch() rejects with a bare
 * TypeError — "Load failed" on WebKit (which is every iOS browser, Chrome
 * included), "Failed to fetch" on Chromium — carrying no status and no body,
 * because no response ever arrived. Showing that string verbatim told the user
 * nothing and, worse, implied the mint had failed.
 *
 * It has not necessarily failed. The request may have reached the server and
 * the passport may be minting right now; we lost the answer, not the work. So
 * say that, and point at a refresh rather than a retry. Minting the same
 * country twice reverts on chain (PassportNFTV4: "Already own passport for this
 * country"), so a retry cannot double-charge — but it can waste a wallet
 * round-trip and read as a second failure.
 */
export function describeMintFailure(err: unknown): string {
  if (isTransportFailure(err)) {
    return (
      "Lost connection before the server answered. Your passport may still " +
      "be minting — refresh this page in a minute to check before trying again."
    );
  }

  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return message || "Failed to mint passport";
}
