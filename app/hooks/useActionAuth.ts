"use client";

import { useCallback } from "react";
import { useSignMessage } from "wagmi";

import { authHeaders } from "@/lib/quick-auth-client";
import { walletAuthHeaders } from "@/lib/wallet-auth-client";
import { useWalletContext } from "./useWalletContext";

/**
 * Auth headers for an action, using whichever proof the user can actually produce.
 *
 * `/api/execute-delegated` fails closed on PROVEN ownership of `userAddress` for every action
 * that spends the user's Safe, and ignores ENFORCE_QUICK_AUTH when doing so. Callers that sent
 * only `authHeaders()` were therefore Farcaster-only by construction: a browser has no Quick
 * Auth token, so the request came back 401 "This action requires proof you own this address."
 * That is what every browser passport mint hit on 2026-08-31.
 *
 * In Farcaster: the Quick Auth token, exactly as before — no wallet prompt ever appears.
 * Outside it: a wallet signature. The signed message is bound to the server's `context` string,
 * so pass the same value the route hands to authorizeUserAddress:
 *
 *   execute-delegated   →  `execute-delegated:${action}`
 *   create-delegation   →  "create-delegation"
 *   bot-command         →  "bot-command"
 *
 * Quick Auth is not even attempted outside Farcaster: `sdk.quickAuth.getToken()` has no host to
 * answer its postMessage and only resolves on its 3s timeout, which would stall every call.
 *
 * Costs a wallet prompt, so use it for the actions that genuinely require proven ownership —
 * not for reads.
 *
 * `address` overrides the connected address for callers that act on an address held in props
 * rather than read from the wallet context. The server rejects a signature that does not match
 * the `userAddress` in the body, so the two must be the same value.
 */
export function useActionAuth() {
  const { walletAddress, isFarcaster } = useWalletContext();
  const { signMessageAsync } = useSignMessage();

  return useCallback(
    async (
      context: string,
      address?: string | null,
    ): Promise<Record<string, string>> => {
      if (isFarcaster) return authHeaders();
      const signer = address || walletAddress;
      if (!signer) return {};
      return walletAuthHeaders({
        address: signer,
        signMessage: signMessageAsync,
        context,
      });
    },
    [isFarcaster, walletAddress, signMessageAsync],
  );
}
