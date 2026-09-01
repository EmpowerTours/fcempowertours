"use client";

import { useCallback, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { useFarcasterContext } from "@/app/hooks/useFarcasterContext";
import { authHeaders } from "@/lib/quick-auth-client";
import { walletAuthHeaders } from "@/lib/wallet-auth-client";
import { delegationIsProven } from "@/lib/delegation-proven-client";

/** Must match the `context` the server passes to authorizeUserAddress. */
const AUTH_CONTEXT = "bot-command";

export type BotCommandResponse = {
  success: boolean;
  action?:
    | "info"
    | "navigate"
    | "transaction"
    | "buy_music"
    | "redirect"
    | "open_url";
  path?: string;
  url?: string; // For redirect/open_url action
  message?: string;
  txHash?: string;
  tokenId?: string | number;
  error?: string;
};

export function useBotCommand() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ✅ USE EXISTING useFarcasterContext HOOK
  const {
    fid,
    walletAddress,
    isLoading: contextLoading,
    custodyAddress,
  } = useFarcasterContext();

  // Fallback identity for people who are not in a Farcaster client at all.
  // wagmi is mounted app-wide by ClientProviders, so these are always available.
  const { address: connectedAddress } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const executeCommand = useCallback(
    async (
      command: string,
      options?: {
        location?: { latitude: number; longitude: number };
        fid?: number | string;
        imageUrl?: string; // For music minting - direct cover image URL
        title?: string; // NFT title (works for both music and art)
        tokenURI?: string; // For music minting - token metadata URI
        is_art?: boolean; // Art vs Music flag for conditional cast posting
        collectorTokenURI?: string; // Collector edition token URI
        collectorPrice?: string; // Collector edition price in WMON
        maxEditions?: string; // Max collector editions
        rightsDeclaration?: object; // Rights declaration for music NFTs
        /**
         * v3 minting only. The artist signs the mint payload in their wallet and these carry
         * that proof to the relayer; on the legacy path both are absent and the platform mints
         * directly. See lib/mint-request.ts.
         */
        mintRequest?: Record<string, string | number>;
        mintSignature?: `0x${string}`;
        /**
         * Ask a non-Farcaster user to sign, proving they own the address.
         * Opt-in because it costs a wallet prompt — set it for commands that
         * spend or move value, not for read-only ones like `radio`/`catalog`.
         * Ignored inside a Farcaster client, which uses Quick Auth instead.
         */
        requireWalletAuth?: boolean;
      },
    ): Promise<BotCommandResponse> => {
      setLoading(true);
      setError(null);

      try {
        // Farcaster's address wins when present, so mini app behaviour is
        // unchanged. Otherwise fall back to the connected browser wallet.
        const userAddress = walletAddress || connectedAddress || null;

        if (!userAddress) {
          const err = "Wallet not connected. Connect a wallet to continue.";
          console.warn(
            "❌ [BOT-HOOK] No Farcaster or connected wallet address",
          );
          setError(err);
          return { success: false, error: err };
        }

        const inFarcaster = Boolean(fid && walletAddress);

        console.log("✅ [BOT-HOOK] Wallet address found:", {
          userAddress,
          fid,
          mode: inFarcaster ? "farcaster" : "wallet",
        });

        // In a Farcaster client: Quick Auth, exactly as before.
        //
        // Outside one: a wallet signature instead. Branching on `inFarcaster`
        // rather than always trying Quick Auth first matters — sdk.quickAuth
        // .getToken() has no host to answer it in a plain browser and only
        // resolves on its 3s timeout, which would stall every command.
        // A signature costs a wallet prompt, and an existing proven delegation
        // already says the same thing — bot-command accepts it. So only ask when
        // there is no delegation to lean on, which is the difference between a
        // prompt on every mint and one per delegation.
        const signForOwnership = async () =>
          walletAuthHeaders({
            address: userAddress,
            signMessage: signMessageAsync,
            context: AUTH_CONTEXT,
          });

        let skippedSignature = false;
        let auth: Record<string, string>;
        if (inFarcaster) {
          auth = await authHeaders();
        } else if (options?.requireWalletAuth) {
          if (await delegationIsProven(userAddress)) {
            auth = {};
            skippedSignature = true;
          } else {
            auth = await signForOwnership();
          }
        } else {
          auth = {};
        }

        const send = (headers: Record<string, string>) =>
          fetch("/api/bot-command", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...headers,
            },
            body: JSON.stringify({
            command,
            userAddress,
            location: options?.location,
            fid: options?.fid || fid,
            imageUrl: options?.imageUrl,
            title: options?.title,
            tokenURI: options?.tokenURI,
            is_art: options?.is_art,
            collectorTokenURI: options?.collectorTokenURI,
            collectorPrice: options?.collectorPrice,
            maxEditions: options?.maxEditions,
            rightsDeclaration: options?.rightsDeclaration,
            mintRequest: options?.mintRequest,
            mintSignature: options?.mintSignature,
            // Diagnostic only. A mint kept arriving without a signature while
            // every check said the client should have produced one, and there
            // was no way to see what the browser actually decided. This makes
            // the server log say it instead of it being inferred.
            _clientMintDiag: {
              hasMintRequest: Boolean(options?.mintRequest),
              hasMintSignature: Boolean(options?.mintSignature),
              signatureSkipped: skippedSignature,
            },
          }),
        });

        let response = await send(auth);

        // The delegation looked usable and the server disagreed — a Redis blip,
        // or it expired between the check and the call. Fall back to the prompt
        // rather than failing with a 401 the user cannot act on, which is the
        // trap in skipping a signature optimistically.
        if (response.status === 401 && skippedSignature) {
          console.warn(
            "[BOT-HOOK] delegation rejected by bot-command; asking for a signature",
          );
          response = await send(await signForOwnership());
        }

        if (!response.ok) {
          const errorData = await response.json();
          const errorMessage =
            errorData.error || errorData.message || "Command failed";
          setError(errorMessage);
          return { success: false, error: errorMessage };
        }

        const data: BotCommandResponse = await response.json();

        if (!data.success) {
          setError(data.message || "Unknown error");
        }

        return data;
      } catch (err: any) {
        const errorMessage = err.message || "Failed to execute command";
        setError(errorMessage);
        console.error("❌ [BOT-HOOK] Command error:", err);
        return { success: false, error: errorMessage };
      } finally {
        setLoading(false);
      }
    },
    [fid, walletAddress, custodyAddress, connectedAddress, signMessageAsync],
  );

  return {
    executeCommand,
    loading,
    error,
    fid,
    walletAddress,
    contextLoading,
  };
}
