import { NextResponse } from "next/server";
import { getResolvedCatalogue } from "@/lib/catalogue-resolved";

/**
 * The catalogue, resolved, for browser callers.
 *
 * ## Why this exists
 *
 * Four client components — `discover`, `nft/[tokenId]`, `artist/[address]` and `LiveRadioModal`
 * — fetched the indexer directly. Being client components they cannot import
 * `catalogue-source`, so they had no fallback: when the indexer went stale on 2026-08-01 they
 * silently served a three-week-old catalogue, while the server routes that shared the same data
 * had already been given one.
 *
 * Putting the read behind an endpoint fixes that in the same move as removing the indexer URL
 * from the browser bundle.
 *
 * ## Not `/api/nfts`
 *
 * That route shuffles its results and slices to ten, because it backs a discovery carousel.
 * Shuffling is exactly wrong for a page that wants one track by id, so this returns the whole
 * catalogue in registry order and lets callers pick.
 *
 * `source` and `reason` are returned rather than hidden. The 2026-08-13 incident was hard to see
 * precisely because nothing said where the data came from.
 */
export async function GET() {
  try {
    const { tracks, source, reason } = await getResolvedCatalogue();

    return NextResponse.json(
      {
        success: true,
        tracks,
        source,
        reason,
      },
      {
        // Metadata is immutable and the chain read is cheap, but a mint should appear without a
        // deploy. Thirty seconds is short enough to feel live and long enough that a page with
        // several components asking at once costs one read.
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
        },
      },
    );
  } catch (error) {
    console.error("[catalogue] read failed:", error);
    return NextResponse.json(
      { success: false, error: "Failed to read the catalogue", tracks: [] },
      { status: 500 },
    );
  }
}
