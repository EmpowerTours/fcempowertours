import { NextRequest, NextResponse } from "next/server";
import { escapeHtml } from "@/lib/auth";
import { getResolvedTrack } from "@/lib/catalogue-resolved";

const APP_URL =
  process.env.NEXT_PUBLIC_URL ||
  "https://fcempowertours-production-6551.up.railway.app";

interface Params {
  tokenId: string;
}

interface NFTData {
  name: string;
  imageUrl: string;
  previewUrl: string;
  artist: string;
  price: string;
}

async function getNFTData(tokenId: string): Promise<NFTData | null> {
  try {
    // Reads the contracts, with the indexer used only while it is demonstrably fresh. The
    // previous version queried Envio directly and had no fallback, so a stale indexer served a
    // stale frame — and a frame is cached by the client that renders it.
    const track = await getResolvedTrack(tokenId);
    if (!track) return null;

    return {
      name: track.name,
      imageUrl: track.imageUrl,
      // The frame plays a preview, so `audioUrl` is what belongs here. It is the full track when
      // the metadata offers one; a 3s `animation_url` is the fallback, not the preference.
      previewUrl: track.audioUrl ?? "",
      artist: track.artist || "Unknown Artist",
      price: track.price ? String(Number(track.price) / 1e18) : "0",
    };
  } catch (error) {
    console.error("❌ Failed to fetch NFT data:", error);
    return null;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const { tokenId } = await params;
    const { searchParams } = new URL(request.url);

    // Check for direct parameters (used when casting immediately after mint)
    const directImage = searchParams.get("imageUrl");
    const directTitle = searchParams.get("title");
    const directPreview = searchParams.get("previewUrl");
    const directPrice = searchParams.get("price");
    const directArtist = searchParams.get("artist");
    const autoplay = searchParams.get("autoplay") === "true";

    console.log("🎬 Frame request for music token:", tokenId, {
      directArtist,
      autoplay,
    });

    // Get NFT data (from params or indexer)
    let nftData: NFTData | null = null;

    if (directImage && directTitle) {
      nftData = {
        name: directTitle,
        imageUrl: directImage,
        previewUrl: directPreview || "",
        artist: directArtist || "Artist",
        price: directPrice || "0",
      };
    } else {
      nftData = await getNFTData(tokenId);
    }

    // Artist profile is the destination within the mini app (with autoplay for music)
    const artistAddress = directArtist || nftData?.artist || "";
    const artistProfileUrl = artistAddress
      ? `${APP_URL}/artist/${artistAddress}?tokenId=${tokenId}${autoplay ? "&autoplay=true" : ""}`
      : `${APP_URL}/oracle`;
    const ogImageUrl = `${APP_URL}/api/og/music?tokenId=${tokenId}${directImage ? `&imageUrl=${encodeURIComponent(directImage)}` : ""}${directTitle ? `&title=${encodeURIComponent(directTitle)}` : ""}${directPrice ? `&price=${encodeURIComponent(directPrice)}` : ""}`;

    // Mini app frame data - launches directly to artist profile
    const frameData = {
      version: "next",
      imageUrl: ogImageUrl,
      button: {
        title: "🎵 Listen & Buy",
        action: {
          type: "launch_frame",
          name: "EmpowerTours",
          url: artistProfileUrl,
          splashImageUrl: `${APP_URL}/splash.png`,
          splashBackgroundColor: "#0f172a",
        },
      },
    };

    // Build HTML with proper OG tags for the cover art
    // The og:image will show the cover art in the cast
    // Audio URL included for players that support it
    // SECURITY: every interpolated value below is attacker-controllable —
    // query params are supplied by whoever crafts the link, and nftData comes
    // from NFT metadata that anyone can set by minting. Escape all of it.
    const safeName = escapeHtml(nftData?.name || `Music NFT #${tokenId}`);
    const safePrice = escapeHtml(nftData?.price || "0");
    const safeImage = escapeHtml(ogImageUrl);
    const safePreview = escapeHtml(nftData?.previewUrl || "");
    const safeProfileUrl = escapeHtml(artistProfileUrl);
    const safeTokenId = escapeHtml(tokenId);

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">

          <!-- Open Graph for cast preview -->
          <meta property="og:title" content="${safeName}">
          <meta property="og:description" content="${nftData?.price ? `${safePrice} WMON - ` : ""}Tap to preview & license on EmpowerTours">
          <meta property="og:image" content="${safeImage}">
          <meta property="og:type" content="music.song">
          <meta property="og:url" content="${APP_URL}/api/frames/music/${safeTokenId}">

          ${
            nftData?.previewUrl
              ? `
          <!-- Audio preview for supported clients -->
          <meta property="og:audio" content="${safePreview}">
          <meta property="og:audio:type" content="audio/mpeg">
          `
              : ""
          }

          <!-- Twitter card -->
          <meta name="twitter:card" content="summary_large_image">
          <meta name="twitter:title" content="${safeName}">
          <meta name="twitter:image" content="${safeImage}">

          <!-- Farcaster Frame with Mini App Launch -->
          <meta name="fc:frame" content='${escapeHtml(JSON.stringify(frameData))}'>
          <meta name="of:version" content="vNext">
          <meta name="of:accepts:farcaster" content="vNext">
          <meta name="of:image" content="${safeImage}">

          <title>${safeName} - EmpowerTours</title>
        </head>
        <body style="background: #0f172a; margin: 0; padding: 40px; font-family: system-ui, sans-serif; color: white; text-align: center;">
          <h1>${safeName}</h1>
          <p>Price: ${safePrice} WMON</p>
          ${
            nftData?.previewUrl
              ? `
            <audio controls style="margin: 20px 0;">
              <source src="${safePreview}" type="audio/mpeg">
              Your browser does not support the audio element.
            </audio>
          `
              : ""
          }
          <p><a href="${safeProfileUrl}" style="color: #00d4ff;">View Artist Profile</a></p>
        </body>
      </html>
    `;

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error: any) {
    console.error("❌ Frame error:", error);
    return new NextResponse("Error generating frame", { status: 500 });
  }
}
