import { NextRequest, NextResponse } from "next/server";
import { escapeHtml } from "@/lib/auth";
import { Redis } from "@upstash/redis";
import { EPK_SLUG_PREFIX } from "@/lib/epk/constants";
import { fetchEPKFromIPFS, fetchEPKFromChain } from "@/lib/epk/utils";

const redis = Redis.fromEnv();
const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || "";
const APP_URL =
  process.env.NEXT_PUBLIC_URL ||
  "https://fcempowertours-production-6551.up.railway.app";

/**
 * GET /api/frames/epk/[identifier] - Farcaster Frame for EPK sharing
 * Returns Frame v2 metadata that opens the EPK as a mini app
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ identifier: string }> },
) {
  try {
    const { identifier } = await params;

    // Resolve slug to address
    let artistAddress: string | null = null;
    if (identifier.startsWith("0x") && identifier.length === 42) {
      artistAddress = identifier;
    } else {
      artistAddress = await redis.get<string>(
        `${EPK_SLUG_PREFIX}${identifier}`,
      );
    }

    // Try to get EPK metadata for OG info
    let artistName = "Artist";
    let genre = "Music";
    let location = "";
    let verified = false;

    if (artistAddress && ENVIO_ENDPOINT) {
      const onChainData = await fetchEPKFromChain(
        artistAddress,
        ENVIO_ENDPOINT,
      );
      if (onChainData) {
        verified = true;
        const metadata = await fetchEPKFromIPFS(onChainData.ipfsCid);
        if (metadata) {
          artistName = metadata.artist.name;
          genre = metadata.artist.genre.join(", ");
          location = metadata.artist.location;
        }
      }
    }

    // If no on-chain data, try Redis cache
    if (!verified && artistAddress) {
      const cachedCid = await redis.get<string>(`epk:cache:${artistAddress}`);
      if (cachedCid) {
        const metadata = await fetchEPKFromIPFS(cachedCid);
        if (metadata) {
          artistName = metadata.artist.name;
          genre = metadata.artist.genre.join(", ");
          location = metadata.artist.location;
        }
      }
    }

    const ogImageUrl = `${APP_URL}/api/og/epk?name=${encodeURIComponent(artistName)}&genre=${encodeURIComponent(genre)}&location=${encodeURIComponent(location)}&verified=${verified}`;
    const epkUrl = `${APP_URL}/epk/${identifier}`;

    // Return Farcaster Frame v2 HTML
    // SECURITY: artist name/genre/location come from user-supplied EPK
    // metadata, and identifier is attacker-controlled path input —
    // this is the stored-XSS path, not just reflected.
    const safeArtistName = escapeHtml(artistName);
    const safeGenre = escapeHtml(genre);
    const safeLocation = escapeHtml(location);
    const safeEpkUrl = escapeHtml(epkUrl);
    const safeOgImageUrl = escapeHtml(ogImageUrl);

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta property="og:title" content="${safeArtistName} | Electronic Press Kit" />
  <meta property="og:description" content="${safeGenre} | ${safeLocation}" />
  <meta property="og:image" content="${safeOgImageUrl}" />
  <meta property="fc:frame" content="vNext" />
  <meta property="fc:frame:image" content="${safeOgImageUrl}" />
  <meta property="fc:frame:image:aspect_ratio" content="1.91:1" />
  <meta property="fc:frame:button:1" content="View Press Kit" />
  <meta property="fc:frame:button:1:action" content="link" />
  <meta property="fc:frame:button:1:target" content="${safeEpkUrl}" />
  <meta property="fc:frame:button:2" content="Book Artist" />
  <meta property="fc:frame:button:2:action" content="link" />
  <meta property="fc:frame:button:2:target" content="${safeEpkUrl}#booking" />
</head>
<body>
  <h1>${safeArtistName} - Electronic Press Kit</h1>
  <p>${safeGenre}</p>
  <a href="${safeEpkUrl}">View Full Press Kit</a>
</body>
</html>`;

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html" },
    });
  } catch (error: any) {
    console.error("[EPK Frame] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
