import { NextResponse } from "next/server";
import {
  createPublicClient,
  http,
  type Address,
  type PublicClient,
} from "viem";
import { activeChain } from "@/app/chains";
import { getResolvedCatalogue } from "@/lib/catalogue-resolved";
import { getCatalogueTotals, getRecentLicenses } from "@/lib/user-holdings";
import { getRecentPassports } from "@/lib/passport-lookup";

/**
 * Everything the dashboard shows, read from the contracts.
 *
 * ## Why an endpoint rather than a fix in each page
 *
 * `app/dashboard/page.tsx` and `app/components/oracle/DashboardModal.tsx` each sent their own
 * copy of one big GraphQL document — six tables in a single query: GlobalStats, all NFTs, music,
 * art, passports and licences. Two copies of the same query means two chances to drift, and both
 * were client components, so neither could read a contract even though every answer they wanted
 * was on chain. One server route, two consumers.
 *
 * ## Why every table turned out to be reconstructible
 *
 * The indexer's value was supposed to be the global feeds — "the 10 most recent of X across
 * everyone" — which a per-user contract read cannot answer. It turns out the contracts answer it
 * more directly: masters, licences and passports all get their ids from monotonic counters, so id
 * order IS mint order and "most recent" is the top of the range. No scan, no sort, no events.
 *
 * The one real trap is that the three counters do not agree on where ids start. Masters and
 * passports count from 1; licence ids carry a 1,000,000 offset while `totalLicenses()` returns a
 * count. Worse, `getLicense` reads a mapping, so a wrong id returns a zeroed struct with a 200
 * rather than reverting — an off-by-offset would render a feed of licences for master 0 minted at
 * the epoch instead of failing. `getRecentLicenses` owns that arithmetic, and
 * tools/verify-user-holdings.ts pins it.
 *
 * ## What is lost
 *
 * `txHash` on every feed. The indexer knew which transaction produced each row; contract reads
 * cannot, and the logs are unreachable — `eth_getLogs` is capped at 100 blocks on the public RPC
 * and 10 on the current key. Both consumers render it as `{item.txHash && …}`, so the "TX →" link
 * disappears rather than breaking.
 *
 * Master `owner` is reported as the artist. Masters are minted to their artist and none has been
 * transferred, so this is accurate today; it would stop being accurate if masters became
 * tradeable, at which point this needs an `ownerOf` batch.
 */

export const dynamic = "force-dynamic";

interface FeedNft {
  id: string;
  tokenId: string;
  owner: string;
  artist: string;
  /** Resolved display name — Farcaster, then ProfileRegistry, then a shortened address. */
  artistName: string;
  artistNameSource: string;
  artistNeedsAddressShown: boolean;
  name: string;
  imageUrl: string;
  tokenURI: string;
  price: string;
  priceWMON: string;
  isArt: boolean;
  mintedAt: number;
}

export async function GET() {
  const client = createPublicClient({
    chain: activeChain,
    transport: http(),
  }) as PublicClient;

  const registry = process.env.NEXT_PUBLIC_NFT_CONTRACT as Address | undefined;
  const passportAddress = process.env.NEXT_PUBLIC_PASSPORT_NFT as
    | Address
    | undefined;

  // Without the registry address there is nothing to read, and answering 200 with zeros would be
  // the worst possible response: a misconfigured deployment would look exactly like a platform
  // where nobody has ever minted anything. The first version of this route did that, and it took
  // a local run against a machine missing these vars to notice.
  if (!registry) {
    return NextResponse.json(
      {
        success: false,
        error:
          "NEXT_PUBLIC_NFT_CONTRACT is not set — cannot distinguish an empty catalogue from a missing config",
      },
      { status: 500 },
    );
  }

  try {
    // Independent reads, so they overlap. Each is caught individually rather than allowed to
    // reject the batch — a dashboard missing one panel beats a dashboard showing an error — but
    // the failure is RECORDED, so a zero that came from a broken read is never presented as a
    // zero that came from an empty contract.
    const errors: string[] = [];
    const note = (what: string) => (e: unknown) => {
      console.error(`[dashboard] ${what} failed:`, e);
      errors.push(what);
      return null;
    };

    const [catalogueRes, totalsRes, licensesRes, passportsRes] =
      await Promise.all([
        // Resolved rather than raw: the modal shows track names, cover art and artist names,
        // and this shares the metadata cache with every other surface instead of building a
        // parallel one. 1000 rather than the default 15 because the counts below are derived
        // from this list, so a limit would under-report them rather than truncate a feed.
        getResolvedCatalogue({ client, limit: 1000 }).catch(note("catalogue")),
        getCatalogueTotals(client, registry).catch(note("totals")),
        getRecentLicenses(client, registry, 10).catch(note("licenses")),
        passportAddress
          ? getRecentPassports(client, passportAddress, 10).catch(
              note("passports"),
            )
          : Promise.resolve(null),
      ]);

    if (!passportAddress) errors.push("passports (NEXT_PUBLIC_PASSPORT_NFT unset)");

    const catalogue = catalogueRes?.tracks ?? [];
    const totals = totalsRes ?? { totalMasters: 0, totalLicenses: 0 };
    const licenses = licensesRes ?? [];
    const passports = passportsRes ?? [];

    const nfts: FeedNft[] = catalogue.map((row) => ({
      id: row.id,
      tokenId: row.tokenId,
      owner: row.artist,
      artist: row.artist,
      artistName: row.artistName,
      artistNameSource: row.artistNameSource,
      artistNeedsAddressShown: row.artistNeedsAddressShown,
      name: row.name,
      imageUrl: row.imageUrl,
      tokenURI: row.tokenURI,
      price: row.price,
      priceWMON: row.priceWMON,
      isArt: row.isArt,
      mintedAt: row.createdAt,
    }));

    // `readCatalogueFromChain` already returns newest first, so these slices preserve that order
    // without re-sorting — and re-sorting on `mintedAt` would be wrong anyway, because the legacy
    // contract stores no mint time and reports 0.
    const music = nfts.filter((n) => !n.isArt);
    const art = nfts.filter((n) => n.isArt);

    // The indexer's "Active Users" counted every address it had ever seen in an event, which no
    // contract read can reproduce — there is no user registry, and the logs are out of reach.
    // This counts distinct addresses that currently hold or created something, which is a
    // smaller and different number. The consumers relabel the tile "Participants" rather than
    // presenting this as the old figure.
    const participants = new Set<string>();
    for (const n of nfts) participants.add(n.artist.toLowerCase());
    for (const l of licenses)
      if (l.licensee) participants.add(l.licensee.toLowerCase());
    for (const p of passports)
      if (p.owner) participants.add(p.owner.toLowerCase());
    participants.delete("0x0000000000000000000000000000000000000000");

    return NextResponse.json(
      {
        // `partial` is the honest signal: some panel below is empty because a read failed, not
        // because there is nothing there. A consumer can say so instead of rendering a zero.
        success: true,
        partial: errors.length > 0,
        unavailable: errors,
        stats: {
          totalNFTs: nfts.length,
          totalMusic: music.length,
          totalArt: art.length,
          totalMasters: totals.totalMasters,
          totalLicenses: totals.totalLicenses,
          totalPassports: passports.length,
          totalParticipants: participants.size,
        },
        allNFTs: nfts.slice(0, 10),
        music: music.slice(0, 10),
        art: art.slice(0, 10),
        passports,
        licenses,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300",
        },
      },
    );
  } catch (error) {
    console.error("[dashboard] read failed:", error);
    return NextResponse.json(
      { success: false, error: "Could not read dashboard data" },
      { status: 500 },
    );
  }
}
