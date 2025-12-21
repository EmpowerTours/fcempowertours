export const dynamic = 'force-dynamic';
import { NextResponse } from "next/server";
import { APP_URL } from "../../../lib/constants";
export async function GET() {
  const farcasterConfig = {
    frame: {
      name: "EmpowerTours",
      version: "1",
      iconUrl: `${APP_URL}/images/icon.png`,
      homeUrl: `${APP_URL}`,
      imageUrl: `${APP_URL}/images/feed.png`,
      buttonTitle: "EmpowerTours",
      splashImageUrl: `${APP_URL}/images/splash.png`,
      splashBackgroundColor: "#353B48",
      webhookUrl: `${APP_URL}/api/webhook`,
      subtitle: "Travel Stamp Buy Experiences",
      description: "Mint and share Travel and Music NFTs on EmpowerTours, powered by Monad and Farcaster.",
      primaryCategory: "social",
      screenshotUrls: [
        `${APP_URL}/images/screenshot1.png`
      ],
      heroImageUrl: `${APP_URL}/images/hero.png`,
      tags: [
        "travel",
        "music",
        "nfts",
        "farcaster",
        "monad"
      ],
      tagline: "Unlock travel adventures",
      ogTitle: "EmpowerTours - DigitalPassport",
      ogDescription: "Mint and share Travel and Music NFTs on EmpowerTours.",
      ogImageUrl: `${APP_URL}/images/og-image.png`,
      castShareUrl: `${APP_URL}/share-cast`
    },
    accountAssociation: {
      header: "eyJmaWQiOjc2NTk5NCwidHlwZSI6ImN1c3RvZHkiLCJrZXkiOiIweDVDNDQwOWM4ODcxQzc1NjAzOTI2NGZmQTE3QTUxNENFMzE3RjdhM2MifQ",
      payload: "eyJkb21haW4iOiJmY2VtcG93ZXJ0b3Vycy1wcm9kdWN0aW9uLTY1NTEudXAucmFpbHdheS5hcHAifQ",
      signature: "MHg0ZDcxNzU1ZjA0N2I4ZjE4Zjg5ZWM3YWFhMmU1NjUwNmY4MGFhOTg0ZDc0Y2ZkMmMxY2JkZGI0NjJmZmZlOGEwNWU2N2U1NTI2NWJjZDg0MmNlYTI5YzA2MmZmNzMzNTA5ZGQ3MjJmYWYzMDI3N2E4YWRmMDg0M2NhMzZkOWRkODFi"
    }
  };
  return NextResponse.json(farcasterConfig);
}
