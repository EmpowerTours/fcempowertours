import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  return new NextResponse(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta property="og:title" content="EmpowerTours Passport Mint" />
        <meta property="og:image" content="https://fcempowertours-production-6551.up.railway.app/images/splash.png" />
        <meta property="fc:frame" content="vNext" />
        <meta property="fc:frame:image" content="https://fcempowertours-production-6551.up.railway.app/images/splash.png" />
        <meta property="fc:frame:image:aspect_ratio" content="1:1" />
        <meta property="fc:frame:button:1" content="Mint Passport" />
        <meta property="fc:frame:button:1:action" content="post" />
        <meta property="fc:frame:post_url" content="${process.env.NEXT_PUBLIC_URL}/frame" />
      </head>
      <body></body>
    </html>
  `);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fid } = body.untrustedData;
    if (!fid) throw new Error("No FID");

    // Generate metadata (hardcode for testing; replace with location detection)
    const metadataRes = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/upload-metadata`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ countryCode: "MX", countryName: "Mexico" }),
    });
    const { tokenURI } = await metadataRes.json();
    if (!tokenURI) throw new Error("Metadata generation failed");

    // Mint gasless
    const mintRes = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/mint-passport`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fid, countryCode: "MX", countryName: "Mexico", tokenURI }),
    });
    const mintData = await mintRes.json();
    if (mintData.error) throw new Error(mintData.error);

    return new NextResponse(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta property="og:title" content="Success!" />
          <meta property="og:image" content="https://harlequin-used-hare-224.mypinata.cloud/ipfs/${tokenURI.split("ipfs://")[1]}" />
          <meta property="fc:frame" content="vNext" />
          <meta property="fc:frame:image" content="https://harlequin-used-hare-224.mypinata.cloud/ipfs/${tokenURI.split("ipfs://")[1]}" />
          <meta property="fc:frame:image:aspect_ratio" content="1:1" />
        </head>
        <body></body>
      </html>
    `);
  } catch (error: any) {
    return new NextResponse(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta property="og:title" content="Error" />
          <meta property="og:image" content="https://fcempowertours-production-6551.up.railway.app/images/splash.png" />
          <meta property="fc:frame" content="vNext" />
          <meta property="fc:frame:image" content="https://fcempowertours-production-6551.up.railway.app/images/splash.png" />
          <meta property="fc:frame:image:aspect_ratio" content="1:1" />
          <meta property="fc:frame:button:1" content="Try Again" />
          <meta property="fc:frame:button:1:action" content="post" />
          <meta property="fc:frame:post_url" content="${process.env.NEXT_PUBLIC_URL}/frame" />
        </head>
        <body></body>
      </html>
    `);
  }
}
