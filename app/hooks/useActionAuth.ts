"use client";

import { useCallback } from "react";
import { useSignMessage } from "wagmi";

import { authHeaders } from "@/lib/quick-auth-client";
import {
  delegationSessionHeaders,
  readDelegationSession,
} from "@/lib/delegation-session-client";
import { delegationCovers } from "@/lib/delegation-covered";
import { walletAuthHeaders } from "@/lib/wallet-auth-client";
import { useWalletContext } from "./useWalletContext";

/**
 * Auth headers for an action, using whichever proof the user can actually produce.
 *
 * Prefer order (no extra prompts when a live session exists):
 *   1. Farcaster Quick Auth bearer (+ session if present)
 *   2. Existing 24h delegation session, when the context is covered
 *   3. Fresh wallet / passkey signature (EOA or ERC-1271)
 *
 * Server routes gate on requireUserProof / ownsAddress and ignore
 * ENFORCE_QUICK_AUTH for fund-moving and identity-bound writes.
 */
export function useActionAuth() {
  const { walletAddress, isFarcaster } = useWalletContext();
  const { signMessageAsync } = useSignMessage();

  return useCallback(
    async (
      context: string,
      address?: string | null,
    ): Promise<Record<string, string>> => {
      const signer = address || walletAddress;
      const session = signer ? delegationSessionHeaders(signer) : {};

      if (isFarcaster) {
        return { ...(await authHeaders()), ...session };
      }
      if (!signer) return {};

      // Reuse the 24h session whenever the server will accept it for this
      // context — no wallet prompt on every action.
      if (readDelegationSession(signer) && delegationCovers(context)) {
        return { ...session };
      }

      return {
        ...(await walletAuthHeaders({
          address: signer,
          signMessage: signMessageAsync,
          context,
        })),
        ...session,
      };
    },
    [isFarcaster, walletAddress, signMessageAsync],
  );
}
