"use client";

import { useCallback, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { useFarcasterContext } from "@/app/hooks/useFarcasterContext";
import { authHeaders } from "@/lib/quick-auth-client";
import { walletAuthHeaders } from "@/lib/wallet-auth-client";

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
        const auth = inFarcaster
          ? await authHeaders()
          : options?.requireWalletAuth
            ? await walletAuthHeaders({
                address: userAddress,
                signMessage: signMessageAsync,
                context: AUTH_CONTEXT,
              })
            : {};

        const response = await fetch("/api/bot-command", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...auth,
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
          }),
        });

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
