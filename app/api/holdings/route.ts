import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { activeChain } from "@/app/chains";
import { getLicenceHoldings, getCatalogueTotals } from "@/lib/user-holdings";

/**
 * Licences held by an address, and the platform totals.
 *
 * ## Why this exists
 *
 * Browser callers cannot import `lib/user-holdings` — it reads contracts server-side. This is the
 * same shape as `/api/catalogue`: one place that knows how to answer, so the four components and
 * five routes asking this question cannot each answer it slightly differently. They previously
 * did, which is how the licences view ended up querying only the v3 registry and reporting
 * nothing for a holder of three legacy licences.
 *
 * `?totals=1` returns the platform counts without an address, for dashboards.
 *
 * ## The shape is deliberate
 *
 * `masters[]` carries `v3Count` and `legacyValid` separately rather than a single boolean. They
 * mean different things: a v3 licence is perpetual, a legacy one expires and this only reports it
 * while valid. A caller rendering "you own this" wants either; a caller explaining *why* access
 * will lapse needs to know which.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");
  const wantTotals = searchParams.get("totals") === "1" || !address;

  if (address && !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json(
      { success: false, error: "Invalid address" },
      { status: 400 },
    );
  }

  try {
    const client = createPublicClient({
      chain: activeChain,
      transport: http(),
    });

    const [holdings, totals] = await Promise.all([
      address ? getLicenceHoldings(client, address) : Promise.resolve(null),
      wantTotals ? getCatalogueTotals(client) : Promise.resolve(null),
    ]);

    return NextResponse.json(
      { success: true, holdings, totals },
      {
        // A purchase should show up quickly, and these are cheap batched reads. Short enough
        // that someone who just bought a licence sees it, long enough that a page with several
        // components asking at once costs one round of reads.
        headers: {
          "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60",
        },
      },
    );
  } catch (error) {
    console.error("[holdings] read failed:", error);
    return NextResponse.json(
      { success: false, error: "Could not read holdings" },
      { status: 500 },
    );
  }
}
