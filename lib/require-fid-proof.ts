import { NextRequest, NextResponse } from "next/server";

import { verifyQuickAuth } from "@/lib/quick-auth";
import { verifyFarcasterFID } from "@/lib/auth";
import { requireUserProof } from "@/lib/require-user-proof";
import { WALLET_AUTH_HEADERS } from "@/lib/wallet-auth-headers";

/**
 * Fail-closed gate for resources keyed by Farcaster FID (e.g. playlists).
 *
 * Accepts ANY ONE of:
 *   1. Verified Quick Auth token whose FID equals the claimed FID
 *   2. Proven wallet / passkey ownership of an address that Neynar links to
 *      that FID (via requireUserProof + verifyFarcasterFID)
 *
 * Never consults ENFORCE_QUICK_AUTH / `allowed`.
 */

export type FidProofSuccess = {
  ok: true;
  fid: number;
  address?: string;
  mode: "quickauth" | "wallet" | "attestation" | "delegation";
};

export type FidProofFailure = {
  ok: false;
  response: NextResponse;
};

export type FidProofResult = FidProofSuccess | FidProofFailure;

function unauthorized(reason: string): FidProofFailure {
  return {
    ok: false,
    response: NextResponse.json(
      {
        success: false,
        error:
          reason ||
          "This action requires proof you own this Farcaster account.",
      },
      { status: 401 },
    ),
  };
}

export async function requireFidProof(
  req: NextRequest,
  claimedFid: number | string | null | undefined,
  context: string,
  opts?: {
    /** Optional address to prove when no Quick Auth token is present. */
    addressHint?: string | null;
  },
): Promise<FidProofResult> {
  const fidNum = Number(claimedFid);
  if (!Number.isInteger(fidNum) || fidNum <= 0) {
    return unauthorized("Valid Farcaster ID (fid) required.");
  }

  const qa = await verifyQuickAuth(req);
  if (qa.ok && qa.user.fid === fidNum) {
    return {
      ok: true,
      fid: fidNum,
      address: qa.user.signInAddress || qa.user.addresses[0],
      mode: "quickauth",
    };
  }

  const hinted =
    opts?.addressHint ||
    req.headers.get(WALLET_AUTH_HEADERS.address) ||
    null;

  if (!hinted) {
    return unauthorized(
      qa.ok
        ? "Authenticated Farcaster account does not match this FID."
        : "Prove this FID with a Farcaster sign-in, or connect a wallet linked to it and sign.",
    );
  }

  const proof = await requireUserProof(req, hinted, context);
  if (!proof.ok) return proof;

  const link = await verifyFarcasterFID(fidNum, proof.address);
  if (!link.valid) {
    return unauthorized(
      link.error ||
        `Address ${proof.address} is not linked to FID ${fidNum}.`,
    );
  }

  return {
    ok: true,
    fid: fidNum,
    address: proof.address,
    mode: proof.mode,
  };
}
