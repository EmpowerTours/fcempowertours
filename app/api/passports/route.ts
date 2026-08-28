import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, type Address } from "viem";
import { activeChain } from "@/app/chains";
import { getAllCountryCodes } from "@/lib/passport/countries";
import { findAllPassports, getPassportDetails } from "@/lib/passport-lookup";

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
  if (!address && !fid) {
    return NextResponse.json(
      { success: false, error: "Pass ?address= or ?fid=" },
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
