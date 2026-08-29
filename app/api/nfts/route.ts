import { NextResponse } from "next/server";
import { getCatalogue } from "@/lib/catalogue-source";

// Force dynamic rendering - don't cache this route
export const dynamic = "force-dynamic";
export const revalidate = 0;

const PINATA_GATEWAY = process.env.NEXT_PUBLIC_PINATA_GATEWAY
  ? `https://${process.env.NEXT_PUBLIC_PINATA_GATEWAY}/ipfs/`
  : "https://gateway.pinata.cloud/ipfs/";

interface NFTObject {
  id: string;
  type: "ART" | "MUSIC";
  tokenId: string;
  name: string;
  imageUrl: string;
  price: string;
  contractAddress: string;
  tokenURI?: string; // For music NFTs to fetch metadata
  artistUsername?: string; // Farcaster username of the artist
}

// Utility function to resolve IPFS URLs with thumbnail optimization
const resolveIPFS = (url: string, _thumbnail: boolean = false): string => {
  if (!url) return "";

  let resolvedUrl = url;
  if (url.startsWith("ipfs://")) {
    resolvedUrl = url.replace("ipfs://", PINATA_GATEWAY);
  }

  return resolvedUrl;
};

export async function GET() {
  try {
    // Experiences were removed with the travel features — this is a music platform.
    //
    // The indexer branch is gone. It stalled on 2026-08-13 and kept answering 200 with stale
    // rows for eight days, so "the request succeeded" was never evidence of anything; every
    // token minted after that was served by the chain fallback regardless. Reading the
    // contracts directly removes the hop and the stale-but-successful failure mode with it.
    const catalogue = await getCatalogue({ limit: 15 });

    const musicNFTs = catalogue.rows;

    // Fetch Farcaster usernames for all unique artist addresses
    const artistAddresses = [
      ...new Set(musicNFTs.map((nft: any) => nft.artist).filter(Boolean)),
    ] as string[];
    const artistUsernames: Record<string, string> = {};

    if (artistAddresses.length > 0) {
      try {
        const neynarApiKey =
          process.env.NEYNAR_API_KEY || process.env.NEXT_PUBLIC_NEYNAR_API_KEY;
        console.log(
          "[get-nfts] Looking up usernames for artists:",
          artistAddresses,
        );
        if (neynarApiKey) {
          const addressesParam = artistAddresses.join(",");
          // Try with hyphen format and address_types parameter
          const neynarUrl = `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${addressesParam}&address_types=custody_address,verified_address`;
          console.log("[get-nfts] Neynar URL:", neynarUrl);
          const neynarResponse = await fetch(neynarUrl, {
            headers: { api_key: neynarApiKey },
          });

          if (neynarResponse.ok) {
            const neynarData = await neynarResponse.json();
            console.log(
              "[get-nfts] Neynar response keys:",
              Object.keys(neynarData),
            );
            // Map addresses to usernames - response is keyed by lowercase address
            for (const address of artistAddresses) {
              const users = neynarData[address.toLowerCase()];
              if (users && users.length > 0) {
                artistUsernames[address.toLowerCase()] = users[0].username;
                console.log(
                  "[get-nfts] Found username:",
                  users[0].username,
                  "for",
                  address,
                );
              } else {
                console.log(
                  "[get-nfts] No Farcaster user found for address:",
                  address,
                );
              }
            }
            console.log(
              "[get-nfts] Fetched Farcaster usernames for",
              Object.keys(artistUsernames).length,
              "artists",
            );
          } else {
            const errorText = await neynarResponse
              .text()
              .catch(() => "no body");
            console.error(
              "[get-nfts] Neynar API error:",
              neynarResponse.status,
              errorText.substring(0, 200),
            );
          }
        } else {
          console.warn("[get-nfts] No NEYNAR_API_KEY configured");
        }
      } catch (err) {
        console.error("[get-nfts] Failed to fetch artist usernames:", err);
      }
    }

    // Process Music/Art NFTs - fetch metadata for images
    const processedMusicNFTs: NFTObject[] = await Promise.all(
      musicNFTs.slice(0, 10).map(async (nft: any) => {
        let imageUrl = "";
        let name = nft.isArt ? `Art #${nft.tokenId}` : `Track #${nft.tokenId}`;

        let audioUrl: string | undefined;
        try {
          const metadataUrl = resolveIPFS(nft.tokenURI);
          if (metadataUrl) {
            const metadataRes = await fetch(metadataUrl);
            if (metadataRes.ok) {
              const metadata = await metadataRes.json();
              if (metadata.image) {
                imageUrl = resolveIPFS(metadata.image);
              }
              if (metadata.name) {
                name = metadata.name;
              }
              // Prefer external_url (full track) over animation_url (3s preview)
              const rawAudio =
                metadata.external_url ||
                metadata.audio_url ||
                metadata.audio ||
                metadata.animation_url;
              if (rawAudio) {
                audioUrl = resolveIPFS(rawAudio);
              }
            }
          }
        } catch (error) {
          console.error(
            `Failed to fetch metadata for NFT ${nft.tokenId}:`,
            error,
          );
        }

        // Price is in wei (18 decimals) - convert to WMON
        const priceInWMON = nft.price
          ? (Number(nft.price) / 1e18).toFixed(2)
          : "0";

        // Get artist Farcaster username
        const artistUsername = nft.artist
          ? artistUsernames[nft.artist.toLowerCase()]
          : undefined;

        return {
          id: `music-${nft.id}`,
          type: nft.isArt ? "ART" : "MUSIC",
          tokenId: nft.tokenId.toString(),
          name,
          imageUrl,
          price: priceInWMON,
          contractAddress: process.env.NEXT_PUBLIC_NFT_CONTRACT || "",
          tokenURI: nft.tokenURI, // Include for fetching audio metadata
          audioUrl, // Full track audio URL (external_url preferred over animation_url preview)
          artistUsername, // Farcaster username of the artist
        };
      }),
    );

    const allNFTs = [...processedMusicNFTs];

    // Simple shuffle
    for (let i = allNFTs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allNFTs[i], allNFTs[j]] = [allNFTs[j], allNFTs[i]];
    }

    return NextResponse.json(
      {
        success: true,
        nfts: allNFTs.slice(0, 20), // Return max 20 NFTs for performance
        // Surfaced rather than only logged: seeing "chain" for days on end is the signal that
        // the indexer stopped, which last time went unnoticed for over a week.
        source: catalogue.source,
        sourceReason: catalogue.reason,
      },
      {
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      },
    );
  } catch (error: any) {
    console.error("[get-nfts] Error fetching NFTs:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch NFTs",
        nfts: [], // Return empty array on error so UI doesn't break
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      },
    );
  }
}
