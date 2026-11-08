import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, type Hash } from "viem";
import { activeChain } from "@/app/chains";
import { invalidateCatalogue } from "@/lib/catalogue-resolved";
import { checkRateLimit, getClientIP } from "@/lib/rate-limit";

/**
 * Expire the catalogue cache after a change the artist's own wallet made.
 *
 * ## Why this exists
 *
 * The catalogue is cached for 15s (`lib/catalogue-resolved.ts`). Mints and admin burns go
 * through the server, which clears the cache itself. Price changes, pausing sales and an artist
 * burning their own master do NOT: `TrackSalesControls` sends those from the artist's wallet
 * straight to the contract, so the server never sees them. Without this, the artist's profile
 * reloads right after a price change and shows the OLD price for up to 15s.
 *
 * ## Why it demands a transaction hash
 *
 * An endpoint that clears the cache on request is a way to switch the cache off: every call
 * forces a 33-call chain read against an RPC that 429s at ~28 calls/s. So a clear is honoured
 * only for a transaction that is on chain, succeeded, went to one of the two contracts whose
 * state the catalogue shows, and is recent. Faking one costs real gas.
 *
 * Every refusal is harmless by construction: the cache simply expires on its own.
 */

const RECEIPT_TIMEOUT_MS = 10_000;
/** ~10 minutes of Monad blocks at ~400ms. An old hash proves nothing about a change just made. */
const MAX_AGE_BLOCKS = 1_500n;
const HASH_RE = /^0x[0-9a-fA-F]{64}$/;

const LIMIT = {
  prefix: "catalogue-refresh",
  windowSeconds: 60,
  maxRequests: 10,
  // Refusing costs nothing (the TTL still runs out), so a Redis outage must not open this up.
  failClosed: true,
};

/** Hashes already honoured, so one transaction clears the cache once. Bounded; in-process. */
const seen = new Set<string>();
const SEEN_MAX = 1_000;

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(LIMIT, getClientIP(req));
  if (!rl.allowed) {
    return NextResponse.json(
      { refreshed: false, reason: "rate limited" },
      { status: 429 },
    );
  }

  let txHash: unknown;
  try {
    ({ txHash } = await req.json());
  } catch {
    // fall through to the format check
  }
  if (typeof txHash !== "string" || !HASH_RE.test(txHash)) {
    return NextResponse.json(
      { refreshed: false, reason: "txHash must be a 32-byte hex hash" },
      { status: 400 },
    );
  }
  const hash = txHash.toLowerCase() as Hash;
  if (seen.has(hash)) {
    return NextResponse.json({ refreshed: false, reason: "already applied" });
  }

  const watched = [
    process.env.NEXT_PUBLIC_SALES_CONTROLLER,
    process.env.NEXT_PUBLIC_NFT_CONTRACT,
  ]
    .filter((a): a is string => typeof a === "string" && a.length > 0)
    .map((a) => a.toLowerCase());
  if (watched.length === 0) {
    return NextResponse.json(
      { refreshed: false, reason: "contracts not configured" },
      { status: 503 },
    );
  }

  const client = createPublicClient({ chain: activeChain, transport: http() });
  try {
    // The wallet hands back the hash on submission, so the receipt may be a block or two away.
    const receipt = await client.waitForTransactionReceipt({
      hash,
      timeout: RECEIPT_TIMEOUT_MS,
      pollingInterval: 1_000,
    });
    if (receipt.status !== "success") {
      return NextResponse.json({
        refreshed: false,
        reason: "transaction reverted",
      });
    }
    if (!receipt.to || !watched.includes(receipt.to.toLowerCase())) {
      return NextResponse.json({
        refreshed: false,
        reason: "transaction is not to a catalogue contract",
      });
    }
    const head = await client.getBlockNumber();
    if (head - receipt.blockNumber > MAX_AGE_BLOCKS) {
      return NextResponse.json({
        refreshed: false,
        reason: "transaction is too old",
      });
    }

    if (seen.size >= SEEN_MAX) seen.clear();
    seen.add(hash);
    invalidateCatalogue();
    console.log(
      `[CatalogueRefresh] cleared after ${hash} (block ${receipt.blockNumber})`,
    );
    return NextResponse.json({ refreshed: true });
  } catch (error) {
    console.warn(
      "[CatalogueRefresh] receipt not confirmed:",
      (error as Error)?.message,
    );
    return NextResponse.json(
      { refreshed: false, reason: "transaction not confirmed" },
      { status: 202 },
    );
  }
}
