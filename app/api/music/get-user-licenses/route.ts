import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, parseAbi, type Address } from "viem";
import { activeChain } from "@/app/chains";
import { getResolvedCatalogue } from "@/lib/catalogue-resolved";
import { getLicenceHoldings } from "@/lib/user-holdings";

/**
 * Everything a wallet can play: licences they bought, plus masters they own.
 *
 * ## Read from the contracts, not the indexer
 *
 * This used to query Envio for `MusicLicense` rows and `MusicNFT` rows owned by the address. Two
 * problems with that, neither fixed by the indexer being healthy:
 *
 * - **It only saw one contract.** The v3 cutover left older licences on the legacy NFT. A holder
 *   of three legacy licences read as owning nothing.
 * - **It ignored expiry.** Legacy licences lapse after 30 days; v3 licences are perpetual.
 *   `getLicenceHoldings` asks each side the right question.
 *
 * ## "Owned" means ownerOf, not artist
 *
 * The old query matched `MusicNFT.owner`. The obvious chain equivalent is the registry's `artist`
 * field, and it would be wrong: the v3 migration recorded the deployer as artist for all five
 * masters (see docs/PRIORITIES.md item A), so keying on it would hand the platform wallet
 * everyone's catalogue and give the actual artist nothing. `ownerOf` is the honest question — who
 * holds the token now — and it also survives a master being transferred.
 */

interface Song {
  id: string;
  tokenId: string;
  title: string;
  artist: string;
  artistUsername?: string;
  audioUrl: string;
  imageUrl: string;
}

const MASTER_OWNER_ABI = parseAbi([
  "function ownerOf(uint256 tokenId) view returns (address)",
]);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const address = searchParams.get("address");

    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json(
        { success: false, error: "Address required", songs: [] },
        { status: 400 },
      );
    }

    const owner = address.toLowerCase();
    const client = createPublicClient({
      chain: activeChain,
      transport: http(),
    });
    const registry = process.env.NEXT_PUBLIC_NFT_CONTRACT as
      | Address
      | undefined;

    // The catalogue arrives already resolved — name, artwork, audio and artist name — so nothing
    // below needs a second metadata fetch per track. That join is cached on the tokenURI CID,
    // which is immutable.
    const [{ tracks }, holdings] = await Promise.all([
      getResolvedCatalogue(),
      getLicenceHoldings(client, owner),
    ]);

    const licensed = new Set(holdings.masters.map((m) => m.masterTokenId));

    // Masters the address owns outright. Batched; a master that has been burned reverts and is
    // simply not owned by anyone.
    const owned = new Set<string>();
    if (registry && tracks.length > 0) {
      const owners = await client.multicall({
        contracts: tracks.map((t) => ({
          address: registry,
          abi: MASTER_OWNER_ABI,
          functionName: "ownerOf" as const,
          args: [BigInt(t.tokenId)] as const,
        })),
        allowFailure: true,
      });
      tracks.forEach((t, i) => {
        const r = owners[i];
        if (
          r?.status === "success" &&
          String(r.result).toLowerCase() === owner
        ) {
          owned.add(String(t.tokenId));
        }
      });
    }

    const songs: Song[] = tracks
      .filter(
        (t) =>
          !t.isArt &&
          (licensed.has(String(t.tokenId)) || owned.has(String(t.tokenId))),
      )
      .map((t) => ({
        id: t.id,
        tokenId: String(t.tokenId),
        title: t.name,
        artist: t.artist,
        artistUsername: t.artistName,
        audioUrl: t.audioUrl ?? "",
        imageUrl: t.imageUrl,
      }))
      // A track with no resolvable audio cannot be played, so it is not a song here. Same rule
      // as before; the reason is worth keeping in view because a dead IPFS gateway looks
      // identical to an empty library.
      .filter((song) => song.audioUrl);

    console.log(
      `[get-user-licenses] ${owner.slice(0, 10)}… -> ${songs.length} playable ` +
        `(${licensed.size} licensed, ${owned.size} owned)`,
    );

    return NextResponse.json({ success: true, songs });
  } catch (error: unknown) {
    console.error("Error fetching user licenses:", error);
    return NextResponse.json(
      {
        success: false,
        error: (error as Error)?.message || "Failed to fetch music",
        songs: [],
      },
      { status: 500 },
    );
  }
}
