import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { activeChain } from "@/app/chains";
import { resolveArtistNames, profileLookup } from "@/lib/artist-name";

/**
 * What to call one or more addresses.
 *
 * ## Why this exists alongside `/api/catalogue`
 *
 * The catalogue carries a resolved name per track, which covers every surface that lists music.
 * An artist page does not list music to find its subject — it *is* about an address, and has to
 * name someone who may have released nothing yet. A per-address lookup is the only shape that
 * answers that.
 *
 * ## The rule the response carries
 *
 * `source` and `needsAddressShown` are returned, not just a string. A ProfileRegistry name is
 * self-registered and first-come, and the registry's own comment warns homoglyphs are
 * registerable — so a caller must render it with the address visible, and must never prefix `@`,
 * which belongs to a Farcaster username. Returning the bare name would let a caller make that
 * mistake without noticing.
 *
 * GET /api/artist-name?address=0x…            one address
 * GET /api/artist-name?addresses=0x…,0x…      several, one Neynar call between them
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const single = searchParams.get("address");
  const many = searchParams.get("addresses");

  const requested = (many ? many.split(",") : single ? [single] : [])
    .map((a) => a.trim())
    .filter((a) => /^0x[a-fA-F0-9]{40}$/.test(a));

  if (requested.length === 0) {
    return NextResponse.json(
      { success: false, error: "Pass ?address= or ?addresses= with valid addresses" },
      { status: 400 },
    );
  }

  // A page asking about a hundred artists is asking the wrong question; the cap keeps one
  // request from fanning out into an unbounded number of contract reads.
  if (requested.length > 50) {
    return NextResponse.json(
      { success: false, error: "At most 50 addresses per request" },
      { status: 400 },
    );
  }

  try {
    const client = createPublicClient({ chain: activeChain, transport: http() });
    const names = await resolveArtistNames(
      requested,
      profileLookup(
        client as Parameters<typeof profileLookup>[0],
        process.env.NEXT_PUBLIC_PROFILE_REGISTRY as `0x${string}` | undefined,
      ),
    );

    const out: Record<string, unknown> = {};
    for (const address of requested) {
      const key = address.toLowerCase();
      const resolved = names.get(key);
      out[key] = resolved ?? {
        display: address,
        source: "address",
        address,
        needsAddressShown: false,
      };
    }

    return NextResponse.json(
      { success: true, names: out },
      {
        // A name changes only when someone calls setProfile, and a rename frees the old name in
        // the same transaction — so a short cache is safe and a long one would strand a rename.
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (error) {
    console.error("[artist-name] resolve failed:", error);
    return NextResponse.json(
      { success: false, error: "Could not resolve names" },
      { status: 500 },
    );
  }
}
