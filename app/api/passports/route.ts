import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, type Address } from "viem";
import { activeChain } from "@/app/chains";
import { getAllCountryCodes } from "@/lib/passport/countries";
import {
  findAllPassports,
  getPassportDetails,
  getRecentPassports,
} from "@/lib/passport-lookup";

/**
 * Every passport an address holds.
 *
 * ## Why an endpoint
 *
 * Eleven surfaces asked the indexer `PassportNFT(where: {owner: $address})`. The contract has no
 * enumerator, so the answer takes a 195-country multicall — not something eleven browser
 * components should each work out, and not something they *can* work out, since it reads
 * contracts server-side.
 *
 * ## Why the indexer cannot be repaired into doing this
 *
 * Its passport entry is named `PassportNFTV2`, points at an address its own comment calls **V3**,
 * and the live contract is **V4**. It has been two generations behind since the cutover, so even
 * fully caught up it would miss every passport minted since — including the three that were
 * migrated.
 *
 * ## Cost
 *
 * One request of 195 reads: measured 1202ms cold on the free public RPC, faster warm and on a
 * keyed endpoint. Details are a second, much smaller batch over the handful of hits rather than
 * all 195 candidates.
 *
 * `?countries=MX,US` narrows the search when the caller already knows where to look — a mint flow
 * confirming one country does not need the whole world.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");
  const fidParam = searchParams.get("fid");
  const countriesParam = searchParams.get("countries");
  const withDetails = searchParams.get("details") !== "0";

  if (address && !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json(
      { success: false, error: "Invalid address" },
      { status: 400 },
    );
  }

  const fid = fidParam ? Number(fidParam) : undefined;
  const recentParam = searchParams.get("recent");
  const tokenIdParam = searchParams.get("tokenId");

  if (!address && !fid && !recentParam && !tokenIdParam) {
    return NextResponse.json(
      {
        success: false,
        error: "Pass ?address=, ?fid=, ?tokenId= or ?recent=",
      },
      { status: 400 },
    );
  }

  const passportAddress = process.env.NEXT_PUBLIC_PASSPORT_NFT as
    | Address
    | undefined;
  if (!passportAddress) {
    return NextResponse.json(
      { success: false, error: "NEXT_PUBLIC_PASSPORT_NFT is not set" },
      { status: 500 },
    );
  }

  // Uppercased and de-duplicated: the contract keys on the exact string, so "mx" would silently
  // find nothing rather than erroring.
  const countryCodes = countriesParam
    ? [
        ...new Set(
          countriesParam
            .split(",")
            .map((c) => c.trim().toUpperCase())
            .filter(Boolean),
        ),
      ]
    : getAllCountryCodes();

  try {
    const client = createPublicClient({
      chain: activeChain,
      transport: http(),
    });

    // The global feed and the single-token read are different questions from "what does this
    // wallet hold", and neither goes through the 195-country search. `recent` is the cheaper of
    // the three: id order is mint order, so it reads the top of the range directly.
    if (recentParam || tokenIdParam) {
      if (tokenIdParam) {
        if (!/^\d+$/.test(tokenIdParam)) {
          return NextResponse.json(
            { success: false, error: "tokenId must be a positive integer" },
            { status: 400 },
          );
        }
        const one = await getPassportDetails(client, passportAddress, [
          { tokenId: tokenIdParam, countryCode: "" },
        ]);
        return NextResponse.json(
          { success: true, passports: one },
          {
            headers: {
              "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
            },
          },
        );
      }

      // Bounded so a caller cannot ask for the whole collection in one multicall as it grows.
      const limit = Math.min(Math.max(Number(recentParam) || 10, 1), 50);
      const recent = await getRecentPassports(client, passportAddress, limit);
      return NextResponse.json(
        { success: true, passports: recent },
        {
          headers: {
            "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300",
          },
        },
      );
    }

    const refs = await findAllPassports(client, {
      passportAddress,
      countryCodes,
      address: (address as Address) ?? undefined,
      fid: Number.isFinite(fid) ? fid : undefined,
    });

    const passports = withDetails
      ? await getPassportDetails(client, passportAddress, refs)
      : refs;

    return NextResponse.json(
      { success: true, passports, searched: countryCodes.length },
      {
        // A passport set changes only on mint, so this caches well. Kept short enough that
        // someone who just minted sees it without a hard refresh.
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300",
        },
      },
    );
  } catch (error) {
    console.error("[passports] lookup failed:", error);
    return NextResponse.json(
      { success: false, error: "Could not read passports", passports: [] },
      { status: 500 },
    );
  }
}
