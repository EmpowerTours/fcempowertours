import { NextRequest, NextResponse } from "next/server";
import {
  createPublicClient,
  http,
  type Address,
  type PublicClient,
} from "viem";
import { activeChain } from "@/app/chains";
import { getAllCountryCodes } from "@/lib/passport/countries";
import { findAllPassports, getPassportDetails } from "@/lib/passport-lookup";
import { getOwnedLicenses } from "@/lib/user-holdings";
import { getResolvedCatalogue } from "@/lib/catalogue-resolved";

/**
 * One address's holdings: passports, masters created, licences purchased.
 *
 * ## Why one endpoint
 *
 * Three surfaces asked the indexer the same three questions in three slightly different
 * GraphQL documents — `ProfileModal`, `UserProfileModal` and `app/api/user/public-profile`. Two
 * are client components and so could not read a contract at all, and the third had its own copy
 * of the query. Same answer, three implementations, three chances to drift.
 *
 * ## How each is answered without an index
 *
 * - **Passports.** No enumerator exists: `getPassportByAddress` confirms a passport for a country
 *   you name. So the question is inverted and every country is asked at once — 195 reads in one
 *   Multicall3 batch, ~1.2s cold.
 * - **Created.** Masters carry their artist, so this is the catalogue filtered by artist. Resolved
 *   rather than raw, so names and cover art come from the shared metadata cache.
 * - **Purchased.** The registry has no per-owner index either, so `getOwnedLicenses` walks the
 *   licence range asking `ownerOf`. Bounded, and linear in licences ever minted rather than in
 *   licences held.
 *
 * ## Why a FID is accepted alongside addresses
 *
 * "Created" was the catalogue filtered by artist ADDRESS, and that reported 0 for the account
 * that made every track on the platform. The five live masters were minted by the deployer key
 * during the v3 migration, so `artist` is the deployer while `artistFid` is the artist's. The
 * profile's Press Kit button is gated on `musicCreated > 0`, so it vanished.
 *
 * A master therefore counts as yours if its artist address is one of yours OR its `artistFid`
 * matches the FID you passed. The FID is a claim the minter wrote and nobody checked, so it is
 * only trusted here because a miniapp session's FID comes from authenticated Farcaster context —
 * and because this endpoint only reads public chain state either way.
 *
 * `createdViaFid` is reported separately rather than folded in silently: those tracks pay and
 * accrue plays to the deployer, not to the wallet reading this, and a caller that wants to say
 * so needs to know which ones they are.
 *
 * ## Accepting several addresses
 *
 * `public-profile` passes a wallet AND its Safe, because a user's holdings are split across both.
 * `?address=` takes a comma-separated list for that reason; results are merged and de-duplicated.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("address") || "";
  const fidParam = Number(searchParams.get("fid") || "0");
  const fid = Number.isInteger(fidParam) && fidParam > 0 ? fidParam : 0;

  const addresses = [
    ...new Set(
      raw
        .split(",")
        .map((a) => a.trim().toLowerCase())
        .filter((a) => /^0x[a-f0-9]{40}$/.test(a)),
    ),
  ];

  if (addresses.length === 0) {
    return NextResponse.json(
      { success: false, error: "Pass ?address= with one or more addresses" },
      { status: 400 },
    );
  }

  const registry = process.env.NEXT_PUBLIC_NFT_CONTRACT as Address | undefined;
  const passportAddress = process.env.NEXT_PUBLIC_PASSPORT_NFT as
    | Address
    | undefined;

  // Missing config must not read as "this user owns nothing" — the same failure the dashboard
  // route hid until it was run on a box without these vars.
  if (!registry) {
    return NextResponse.json(
      {
        success: false,
        error: "NEXT_PUBLIC_NFT_CONTRACT is not set",
      },
      { status: 500 },
    );
  }

  const client = createPublicClient({
    chain: activeChain,
    transport: http(),
  }) as PublicClient;

  const errors: string[] = [];
  const note = (what: string) => (e: unknown) => {
    console.error(`[user-stats] ${what} failed:`, e);
    errors.push(what);
    return null;
  };

  try {
    const [passportResults, licenceResults, catalogueRes] = await Promise.all([
      passportAddress
        ? Promise.all(
            addresses.map((a) =>
              findAllPassports(client, {
                passportAddress,
                countryCodes: getAllCountryCodes(),
                address: a as Address,
              }).catch(note(`passports:${a}`)),
            ),
          )
        : Promise.resolve([]),
      Promise.all(
        addresses.map((a) =>
          getOwnedLicenses(client, a, registry).catch(note(`licences:${a}`)),
        ),
      ),
      getResolvedCatalogue({ client, limit: 1000 }).catch(note("catalogue")),
    ]);

    if (!passportAddress)
      errors.push("passports (NEXT_PUBLIC_PASSPORT_NFT unset)");

    // De-duplicated by tokenId: a wallet and its Safe are different addresses, but a passport
    // held by one must not be counted twice when both are passed.
    const refs = new Map<string, { tokenId: string; countryCode: string }>();
    for (const list of passportResults) {
      for (const ref of list ?? []) refs.set(ref.tokenId, ref);
    }

    const passports = passportAddress
      ? await getPassportDetails(client, passportAddress, [
          ...refs.values(),
        ]).catch(() => [...refs.values()])
      : [];

    const licences = new Map<string, unknown>();
    for (const list of licenceResults) {
      for (const l of list ?? []) licences.set(l.licenseId, l);
    }

    const tracks = catalogueRes?.tracks ?? [];
    const byAddress = tracks.filter((t) =>
      addresses.includes(t.artist.toLowerCase()),
    );
    // Matched on the fid the contract stores, for masters minted by a different key. Excludes
    // anything already matched by address so a track is never counted twice.
    const byFid = fid
      ? tracks.filter(
          (t) =>
            t.artistFid === fid && !addresses.includes(t.artist.toLowerCase()),
        )
      : [];
    const created = [...byAddress, ...byFid];

    // Licences reference a master by id; joining here saves each consumer doing it, and means
    // the name shown on a purchase is the same one shown in the catalogue.
    const byTokenId = new Map(tracks.map((t) => [t.tokenId, t]));
    const purchased = [...licences.values()].map((l) => {
      const lic = l as { masterTokenId: string };
      const master = byTokenId.get(lic.masterTokenId);
      return {
        ...(l as Record<string, unknown>),
        masterName: master?.name,
        masterImage: master?.imageUrl,
        masterArtist: master?.artist,
        masterArtistName: master?.artistName,
        masterAudioUrl: master?.audioUrl,
        isArt: master?.isArt ?? false,
      };
    });

    return NextResponse.json(
      {
        success: true,
        partial: errors.length > 0,
        unavailable: errors,
        addresses,
        passports,
        created,
        purchased,
        stats: {
          passports: passports.length,
          musicCreated: created.filter((t) => !t.isArt).length,
          artCreated: created.filter((t) => t.isArt).length,
          /**
           * How many of `created` were matched by FID rather than by address. These are the
           * artist's work, but the contract pays and credits plays to the address that minted
           * them — which is not the address that asked. Non-zero means the two have diverged.
           */
          createdViaFid: byFid.length,
          musicPurchased: purchased.length,
          countries: [
            ...new Set(
              passports
                .map((p) => p.countryCode)
                .filter((c) => c && c !== "XX"),
            ),
          ],
        },
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300",
        },
      },
    );
  } catch (error) {
    console.error("[user-stats] failed:", error);
    return NextResponse.json(
      { success: false, error: "Could not read holdings" },
      { status: 500 },
    );
  }
}
