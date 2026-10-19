import { NextRequest, NextResponse } from "next/server";

import { authorizeUserAddress, fidOwnsAddress } from "@/lib/quick-auth";
import { delegationProvesOwnership } from "@/lib/delegation-proof";
import { DELEGATION_SESSION_HEADER } from "@/lib/delegation-session";

/**
 * Fail-closed identity gate for routes that act for a user.
 *
 * Accepts ANY ONE of:
 *   1. Verified Quick Auth token whose FID owns the address
 *   2. Fresh wallet / passkey signature (EOA or ERC-1271; nonce + expiry)
 *   3. Internal ownership attestation (bot-command → execute-delegated hop)
 *   4. Proven delegation + matching x-delegation-session (PR #4)
 *
 * Never consults `allowed` / ENFORCE_QUICK_AUTH. A missing or mismatched proof
 * is 401. The returned address is the proven one — callers must use it and
 * ignore any body field that disagrees.
 */

export type UserProofSuccess = {
  ok: true;
  address: string;
  mode: "quickauth" | "wallet" | "attestation" | "delegation";
  fid?: number;
};

export type UserProofFailure = {
  ok: false;
  response: NextResponse;
};

export type UserProofResult = UserProofSuccess | UserProofFailure;

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function unauthorized(reason: string): UserProofFailure {
  return {
    ok: false,
    response: NextResponse.json(
      {
        success: false,
        error:
          reason ||
          "This action requires proof you own this address. Reopen the mini app to sign in with Farcaster, or connect your wallet and sign the prompt.",
      },
      { status: 401 },
    ),
  };
}

export async function requireUserProof(
  req: NextRequest,
  claimedAddress: string | null | undefined,
  context: string,
  opts?: {
    /**
     * When set, the delegation must list this action. Omit for identity-only
     * checks (the delegation itself is the proof of ownership).
     */
    action?: string;
  },
): Promise<UserProofResult> {
  if (!claimedAddress || typeof claimedAddress !== "string") {
    return unauthorized("Address required.");
  }
  if (!ADDRESS_RE.test(claimedAddress)) {
    return unauthorized("Invalid Ethereum address format.");
  }

  const target = claimedAddress.toLowerCase();
  const authz = await authorizeUserAddress(req, target, context);

  if (authz.ownsAddress) {
    // authorizeUserAddress proves Quick Auth, wallet signature, or attestation.
    const mode: UserProofSuccess["mode"] =
      authz.mode === "quickauth"
        ? "quickauth"
        : authz.mode === "wallet"
          ? "wallet"
          : "wallet";
    // Distinguishing attestation: authorizeUserAddress reports mode "wallet"
    // for both signature and attestation. That's fine for callers.
    return {
      ok: true,
      address: target,
      mode,
      fid: authz.fid,
    };
  }

  const sessionSecret = req.headers.get(DELEGATION_SESSION_HEADER);
  const viaDelegation = await delegationProvesOwnership(
    target,
    opts?.action,
    sessionSecret,
  );
  if (viaDelegation) {
    return { ok: true, address: target, mode: "delegation", fid: authz.fid };
  }

  return unauthorized(
    authz.reason ||
      "This action requires proof you own this address. Reopen the mini app to sign in with Farcaster, or connect your wallet and sign the prompt.",
  );
}

/**
 * The FID a proven request may act or be attributed as.
 *
 * requireUserProof proves an ADDRESS. A body-supplied FID is a separate,
 * unproven claim: proving your own wallet must not let you mint, publish or
 * cast under someone else's FID. So:
 *   - a FID carried by the proof itself (Quick Auth) always wins;
 *   - otherwise a claimed FID is used only if that FID's custody or verified
 *     addresses include the proven address;
 *   - anything else yields undefined (callers treat it as "no FID").
 */
export async function provenFidFor(
  proof: UserProofSuccess,
  claimedFid: unknown,
): Promise<number | undefined> {
  if (typeof proof.fid === "number" && proof.fid > 0) return proof.fid;
  const n =
    typeof claimedFid === "number"
      ? claimedFid
      : typeof claimedFid === "string" && /^\d+$/.test(claimedFid)
        ? Number(claimedFid)
        : NaN;
  if (!Number.isSafeInteger(n) || n <= 0) return undefined;
  return (await fidOwnsAddress(n, proof.address)) ? n : undefined;
}
