import { NextResponse } from "next/server";
import { refreshPassportMetadata } from "@/lib/passport/refresh";

/**
 * POST /api/climb-stamp
 *
 * Stamps a passport when someone logs a climb in the version1 Telegram dapp.
 *
 * ## Why this endpoint rather than version1 writing on chain
 *
 * Only `owner()` or `oracle()` may stamp a passport, and both are keys this app
 * already holds. Giving the Telegram bot a stamping key would put a second copy
 * of a privileged credential on a second host to save one HTTP call.
 *
 * ## What makes a climb stamp honest
 *
 * `eventType: "climbing"` and the crag's coordinates. The passport contract was
 * always general enough for this — `addVenueStamp` takes a location, a type and a
 * lat/lng, and a crag is a venue with coordinates. No contract change was needed;
 * what was missing was only that the two apps did not know about each other.
 *
 * ONE stamp per climber per CRAG, not per climb. The cost is bounded by how many
 * places exist rather than how often people climb — the same rule that makes
 * discovery stamps affordable. Climbing the same crag twice is not a new place.
 *
 * ## Authentication
 *
 * A shared secret in `CLIMB_STAMP_SECRET`, because the caller is a server, not a
 * user with a wallet. Absent secret means the route is closed rather than open:
 * an endpoint that spends the oracle's gas must not default to allowing everyone.
 */

const PASSPORT_NFT = process.env.NEXT_PUBLIC_PASSPORT_NFT ?? "";
const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC ?? "https://rpc.monad.xyz";
const ORACLE_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY ?? "";

const ABI = [
  "function getTotalSupply() view returns (uint256)",
  "function ownerOf(uint256) view returns (address)",
  "function balanceOf(address) view returns (uint256)",
  "function getPassportStamps(uint256) view returns (tuple(string location,string eventType,address artist,uint256 timestamp,bool verified,string placeId,string googleMapsUri,int256 latitude,int256 longitude)[])",
  "function addVenueStamp(uint256 tokenId, string location, string eventType, address artist, bool verified, string placeId, string googleMapsUri, int256 latitude, int256 longitude) external",
];

export async function POST(req: Request) {
  const secret = process.env.CLIMB_STAMP_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "climb stamping is not configured" },
      { status: 503 },
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: {
    climber?: string;
    location?: string;
    latitude?: number;
    longitude?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const climber = String(body.climber ?? "");
  const location = String(body.location ?? "")
    .trim()
    .slice(0, 40);
  if (!/^0x[0-9a-fA-F]{40}$/.test(climber)) {
    return NextResponse.json(
      { error: "climber must be an address" },
      { status: 400 },
    );
  }
  if (!location) {
    return NextResponse.json(
      { error: "location is required" },
      { status: 400 },
    );
  }
  if (!PASSPORT_NFT || !ORACLE_PRIVATE_KEY) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  try {
    const { JsonRpcProvider, Wallet, Contract } = await import("ethers");
    const provider = new JsonRpcProvider(MONAD_RPC);
    const passport = new Contract(
      PASSPORT_NFT,
      ABI,
      new Wallet(ORACLE_PRIVATE_KEY, provider),
    );

    if ((await passport.balanceOf(climber)) === 0n) {
      // No passport to stamp. Not an error — a climber who has not minted one is
      // an ordinary state, and the bot can invite them to.
      return NextResponse.json({ stamped: false, needsPassport: true });
    }

    let tokenId: bigint | null = null;
    const total: bigint = await passport.getTotalSupply();
    for (let id = total; id >= 1n; id--) {
      try {
        if (
          ((await passport.ownerOf(id)) as string).toLowerCase() ===
          climber.toLowerCase()
        ) {
          tokenId = id;
          break;
        }
      } catch {
        /* burned */
      }
    }
    if (tokenId === null) {
      return NextResponse.json({ stamped: false, needsPassport: true });
    }

    // One stamp per crag, ever. The chain is the check, not a cache: a stamp
    // cannot be removed, so a duplicate is permanent.
    const existing = await passport.getPassportStamps(tokenId);
    const already = existing.some(
      (s: { eventType: string; location: string }) =>
        s.eventType === "climbing" &&
        s.location.toLowerCase() === location.toLowerCase(),
    );
    if (already) {
      return NextResponse.json({
        stamped: false,
        alreadyStamped: true,
        tokenId: Number(tokenId),
      });
    }

    // Coordinates are stored at 1e6, matching the contract's other callers.
    const lat = Math.round(Number(body.latitude ?? 0) * 1e6);
    const lng = Math.round(Number(body.longitude ?? 0) * 1e6);

    // placeId and googleMapsUri left empty on purpose: 194,248 gas instead of
    // 292,236, for two fields nothing in this app reads.
    const tx = await passport.addVenueStamp(
      tokenId,
      location,
      "climbing",
      "0x0000000000000000000000000000000000000000",
      true,
      "",
      "",
      lat,
      lng,
    );
    await tx.wait();

    // The stamp is invisible until the artwork is rebuilt around it.
    const refresh = await refreshPassportMetadata(tokenId);

    return NextResponse.json({
      stamped: true,
      tokenId: Number(tokenId),
      location,
      txHash: tx.hash,
      artworkRefreshed: refresh.refreshed,
    });
  } catch (err: unknown) {
    const reason =
      err instanceof Error
        ? err.message.slice(0, 140)
        : String(err).slice(0, 140);
    console.error("[ClimbStamp] failed:", reason);
    return NextResponse.json(
      { error: "stamp failed", reason },
      { status: 500 },
    );
  }
}
