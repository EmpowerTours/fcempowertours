import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { authorizeUserAddress } from "@/lib/quick-auth";
import {
  getRightsStatus,
  storeRightsStatus,
  isValidIsrc,
  normalizeIsrc,
  formatIsrcForDisplay,
} from "@/lib/rights-declaration";

/**
 * Add an ISRC to a recording that was published without one.
 *
 * An ISRC is issued by a distributor, and most artists here publish before they distribute — so
 * the code simply does not exist at upload time. Without this route their only options would be
 * to leave the record permanently incomplete or to re-mint, which costs gas and creates a second
 * token for the same recording.
 *
 * ## What this deliberately does not do
 *
 * It does **not** rebuild or re-hash the rights agreement. That hash is over the text the artist
 * accepted, and it is the thing that makes the record evidence of what they agreed to. Adding an
 * identifier afterwards is a different act from re-signing the agreement, and conflating the two
 * would silently invalidate every stored hash.
 *
 * So the ISRC is recorded alongside the declaration, with an audit trail, and the original
 * agreement hash is left exactly as it was.
 */

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export async function POST(req: NextRequest) {
  try {
    const { tokenId, isrc, userAddress } = await req.json();

    if (!tokenId || !userAddress) {
      return NextResponse.json(
        { success: false, error: "tokenId and userAddress are required" },
        { status: 400 },
      );
    }

    if (!isValidIsrc(isrc)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "That ISRC does not look right. It should be 12 characters, like GX-F97-26-52851.",
        },
        { status: 400 },
      );
    }

    const auth = await authorizeUserAddress(
      req,
      userAddress,
      "rights-backfill-isrc",
    );
    if (!auth.allowed) {
      return NextResponse.json(
        { success: false, error: "Not authorised for this wallet" },
        { status: 401 },
      );
    }

    const status = await getRightsStatus(redis, String(tokenId));
    if (!status) {
      return NextResponse.json(
        { success: false, error: "No rights record for that token" },
        { status: 404 },
      );
    }

    // Only the artist who signed the declaration may amend it. `authorizeUserAddress` proves the
    // caller controls `userAddress`; this proves that address is the one on the record.
    if (
      status.declaration.artistAddress?.toLowerCase() !==
      String(userAddress).toLowerCase()
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Only the original artist can amend this record",
        },
        { status: 403 },
      );
    }

    const normalised = normalizeIsrc(isrc);

    // Write-once. An ISRC identifies one recording for its lifetime; letting it be rewritten
    // would let a record silently start pointing at a different release.
    if (
      status.declaration.isrcCode &&
      status.declaration.isrcCode !== normalised
    ) {
      return NextResponse.json(
        {
          success: false,
          error: `This recording already has ISRC ${formatIsrcForDisplay(status.declaration.isrcCode)}. Contact admin@empowertours.xyz if it is wrong.`,
        },
        { status: 409 },
      );
    }

    if (status.declaration.isrcCode === normalised) {
      return NextResponse.json({
        success: true,
        alreadySet: true,
        isrc: formatIsrcForDisplay(normalised),
      });
    }

    await storeRightsStatus(
      redis,
      String(tokenId),
      { ...status.declaration, isrcCode: normalised },
      status.agreementCid,
      // Unchanged on purpose — see the note at the top of this file.
      status.agreementHash,
    );

    await redis.set(
      `rights:isrc-backfill:${tokenId}`,
      JSON.stringify({
        isrc: normalised,
        by: userAddress,
        at: new Date().toISOString(),
      }),
    );

    console.log(
      `[rights] ISRC ${normalised} backfilled onto token ${tokenId} by ${userAddress}`,
    );

    return NextResponse.json({
      success: true,
      tokenId: String(tokenId),
      isrc: formatIsrcForDisplay(normalised),
    });
  } catch (err: any) {
    console.error("[rights/backfill-isrc] error:", err);
    return NextResponse.json(
      { success: false, error: "Could not record the ISRC" },
      { status: 500 },
    );
  }
}
