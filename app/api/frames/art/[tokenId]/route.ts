import { NextRequest, NextResponse } from "next/server";
import { escapeHtml } from "@/lib/auth";

const APP_URL =
  process.env.NEXT_PUBLIC_URL ||
  "https://fcempowertours-production-6551.up.railway.app";

interface Params {
  tokenId: string;
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
    const directPrice = searchParams.get("price");

    console.log("🎨 Frame request for art NFT token:", tokenId);

    // ✅ Add ?type=art so the NFT page shows "Loading art..." instead of "Loading music..."
    const miniAppUrl = `${APP_URL}/nft/${tokenId}?type=art`;

    // Build OG URL with direct params if available
    let ogImageUrl = `${APP_URL}/api/og/art?tokenId=${tokenId}`;
    if (directImage) {
      ogImageUrl += `&imageUrl=${encodeURIComponent(directImage)}`;
    }
    if (directTitle) {
      ogImageUrl += `&title=${encodeURIComponent(directTitle)}`;
    }

    const artTitle = directTitle || `Art NFT #${tokenId}`;
    const artPrice = directPrice || "0";

    // Mini app frame data - launches directly to NFT view page
    const frameData = {
      version: "next",
      imageUrl: ogImageUrl,
      button: {
        title: "🎨 View & Buy",
        action: {
          type: "launch_frame",
          name: "EmpowerTours",
          url: miniAppUrl,
          splashImageUrl: `${APP_URL}/splash.png`,
          splashBackgroundColor: "#0f172a",
        },
      },
    };

    // SECURITY: title/price/image come straight from the query string, so
    // whoever crafts the link controls them. Escape before interpolating.
    const safeTitle = escapeHtml(artTitle);
    const safePrice = escapeHtml(artPrice);
    const safeImage = escapeHtml(ogImageUrl);
    const safeMiniAppUrl = escapeHtml(miniAppUrl);
    const safeTokenId = escapeHtml(tokenId);

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">

          <!-- Open Graph for cast preview -->
          <meta property="og:title" content="${safeTitle}">
          <meta property="og:description" content="${safePrice} WMON - Collect & license on EmpowerTours">
          <meta property="og:image" content="${safeImage}">
          <meta property="og:type" content="website">
          <meta property="og:url" content="${APP_URL}/api/frames/art/${safeTokenId}">

          <!-- Twitter card -->
          <meta name="twitter:card" content="summary_large_image">
          <meta name="twitter:title" content="${safeTitle}">
          <meta name="twitter:image" content="${safeImage}">

          <!-- Farcaster Frame with Mini App Launch (same as music frame) -->
          <meta name="fc:frame" content='${escapeHtml(JSON.stringify(frameData))}'>
          <meta name="of:version" content="vNext">
          <meta name="of:accepts:farcaster" content="vNext">
          <meta name="of:image" content="${safeImage}">

          <title>${safeTitle} - EmpowerTours</title>
        </head>
        <body style="background: #0f172a; margin: 0; padding: 40px; font-family: system-ui, sans-serif; color: white; text-align: center;">
          <h1>${safeTitle}</h1>
          <p>Price: ${safePrice} WMON</p>
          <p><a href="${safeMiniAppUrl}" style="color: #00d4ff;">Open in EmpowerTours</a></p>
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
    console.error("❌ Art frame error:", error);
    return new NextResponse("Error generating frame", { status: 500 });
  }
}
