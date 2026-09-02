import { createPublicClient, http, parseAbi } from "viem";
import { activeChain } from "@/app/chains";

/**
 * What an artist actually receives from a sale, per SalesController.
 *
 * `_settle` pays the treasury `price * treasuryFeeBps / 10_000` and the artist
 * the remainder. Two API routes each hardcoded 70% instead — while the deployed
 * `treasuryFeeBps` is 1000, i.e. 90% to the artist. A 1 WMON sale that paid
 * 0.9 WMON was reported to the artist as 0.7. Understating what someone earned
 * is a bad way to be wrong, and the number drifts the moment the fee changes.
 *
 * Read once and cache: this is called per-licence in aggregation loops, and the
 * fee does not change within a request.
 */
const BPS_DENOMINATOR = 10_000n;
const FALLBACK_TREASURY_FEE_BPS = 1000n;
const CACHE_MS = 60_000;

let cached: { bps: bigint; at: number } | null = null;

export async function getTreasuryFeeBps(): Promise<bigint> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.bps;

  const salesController = process.env.NEXT_PUBLIC_SALES_CONTROLLER as
    | `0x${string}`
    | undefined;
  if (!salesController) return FALLBACK_TREASURY_FEE_BPS;

  try {
    const client = createPublicClient({
      chain: activeChain,
      transport: http(),
    });
    const bps = (await client.readContract({
      address: salesController,
      abi: parseAbi(["function treasuryFeeBps() view returns (uint96)"]),
      functionName: "treasuryFeeBps",
    })) as bigint;
    cached = { bps, at: Date.now() };
    return bps;
  } catch (error) {
    console.error("[ArtistCut] treasuryFeeBps read failed:", error);
    return FALLBACK_TREASURY_FEE_BPS;
  }
}

/** The artist's share of `price`, using the fee the contract actually charges. */
export async function artistCutOf(price: bigint): Promise<bigint> {
  const bps = await getTreasuryFeeBps();
  return price - (price * bps) / BPS_DENOMINATOR;
}
