export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { APP_URL } from "../../../lib/constants";
import { associationForHost } from "../../../lib/farcaster-associations";

/**
 * Serve the manifest for the domain it was requested on.
 *
 * Both the URLs and the accountAssociation have to match the serving host: the
 * signature is bound to one domain, and Farcaster reads homeUrl from the manifest
 * it fetched. Deriving the origin from the request lets the railway domain and the
 * custom domain both serve valid manifests during a cutover.
 */
function originFrom(req: Request): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host) return APP_URL;
  const proto =
    req.headers.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function GET(req: Request) {
  const origin = originFrom(req);
  const host = new URL(origin).host;
  const { association, matched } = associationForHost(host);

  const farcasterConfig = {
    frame: {
      name: "EmpowerTours",
      version: "1",
      iconUrl: `${origin}/images/icon.png`,
      homeUrl: `${origin}`,
      imageUrl: `${origin}/images/feed.png`,
      buttonTitle: "EmpowerTours",
      splashImageUrl: `${origin}/images/splash.png`,
      splashBackgroundColor: "#353B48",
      webhookUrl: `${origin}/api/webhook`,
      subtitle: "Art, music and travel onchain",
      description:
        "Mint and sell your art, music and travel NFTs onchain. Artists keep 90%. Works in Farcaster or any browser.",
      primaryCategory: "art-creativity",
      screenshotUrls: [`${origin}/images/screenshot1.png`],
      heroImageUrl: `${origin}/images/hero.png`,
      tags: ["art", "music", "travel", "nfts", "monad"],
      tagline: "Keep 90% of your work",
      ogTitle: "Art, Music and Travel Onchain",
      ogDescription:
        "Mint and sell your art, music and travel NFTs. Artists keep 90%.",
      ogImageUrl: `${origin}/images/og-image.png`,
      castShareUrl: `${origin}/share-cast`,
    },
    accountAssociation: association,
  };

  if (!matched) {
    console.warn(
      `farcaster.json served on unsigned host "${host}" - manifest will not validate there`,
    );
  }

  return NextResponse.json(farcasterConfig);
}
