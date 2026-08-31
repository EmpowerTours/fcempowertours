"use client";

import { useEffect, useState, useCallback } from "react";
import { useAccount, useConnect, useDisconnect, useSendTransaction, useSignTypedData } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useFarcasterContext } from "./useFarcasterContext";

interface WalletContextReturn {
  // Core wallet state
  walletAddress: string | null;
  isConnected: boolean;
  isFarcaster: boolean;
  loading: boolean;

  // User profile (null when standalone)
  user: any | null;
  fid: number | undefined;

  // Wallet actions
  sendTransaction: (params: any) => Promise<any>;
  /**
   * Sign EIP-712 typed data with the connected wallet.
   *
   * Needed because v3 will not let the platform assert who an artist is: minting goes through
   * `SalesController.mintMasterFor`, which takes the artist's signature as proof of consent so
   * the platform can pay the gas without being able to mint in someone else's name.
   */
  signTypedData: (params: {
    domain: Record<string, unknown>;
    types: Record<string, unknown>;
    primaryType: string;
    message: Record<string, unknown>;
  }) => Promise<`0x${string}`>;
  connectWallet: () => void;
  disconnect: () => void;

  // Farcaster-specific (exposed for backward compat)
  sdk: any;
  context: any;
  custodyAddress: string | null;
  walletConnected: boolean;
  isMobile: boolean;
  requestWallet: () => Promise<any>;
  switchChain: (params: { chainId: number }) => Promise<any>;
  error: Error | null;
  isLoading: boolean;
}

/**
 * Unified wallet hook that works in both Farcaster (Warpcast) and standalone browser contexts.
 *
 * In Farcaster: Uses the Farcaster SDK for wallet access, transactions, and user profile.
 * Standalone: Uses wagmi/RainbowKit for wallet connection and transactions.
 *
 * Components consuming this hook don't need to know which context they're in.
 */
export function useWalletContext(): WalletContextReturn {
  const farcaster = useFarcasterContext();

  // wagmi hooks for standalone mode
  const wagmiAccount = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect: wagmiDisconnect } = useDisconnect();
  const { sendTransactionAsync } = useSendTransaction();
  const { signTypedDataAsync } = useSignTypedData();
  const { openConnectModal } = useConnectModal();

  const [isFarcaster, setIsFarcaster] = useState(false);

  // Determine if we're in Farcaster context
  useEffect(() => {
    if (!farcaster.loading && farcaster.context?.user?.fid) {
      setIsFarcaster(true);
    } else if (!farcaster.loading) {
      setIsFarcaster(false);
    }
  }, [farcaster.loading, farcaster.context]);

  // Resolve wallet address from best available source
  const walletAddress = isFarcaster
    ? farcaster.walletAddress
    : (wagmiAccount.address ?? null);

  const isConnected = isFarcaster
    ? !!farcaster.walletAddress
    : wagmiAccount.isConnected;

  const loading = farcaster.loading;

  // Unified sendTransaction
  const sendTransaction = useCallback(
    async (params: any) => {
      if (isFarcaster) {
        return farcaster.sendTransaction(params);
      }

      // Standalone: use wagmi sendTransaction
      if (!wagmiAccount.isConnected) {
        throw new Error("Wallet not connected");
      }

      try {
        // For native token transfers (no data)
        if (!params.data && params.value && params.to) {
          const hash = await sendTransactionAsync({
            to: params.to as `0x${string}`,
            value:
              typeof params.value === "string" && params.value.startsWith("0x")
                ? BigInt(params.value)
                : BigInt(params.value),
          });
          return { transactionHash: hash };
        }

        // For contract calls with data
        if (params.data && params.to) {
          const hash = await sendTransactionAsync({
            to: params.to as `0x${string}`,
            data: params.data as `0x${string}`,
            value: params.value ? BigInt(params.value) : 0n,
          });
          return { transactionHash: hash };
        }

        throw new Error("Invalid transaction parameters");
      } catch (error: any) {
        console.error(
          "[WalletContext] Standalone sendTransaction error:",
          error,
        );
        throw error;
      }
    },
    [isFarcaster, farcaster, wagmiAccount.isConnected, sendTransactionAsync],
  );

  /**
   * Unified EIP-712 signing.
   *
   * Standalone goes through wagmi. In Farcaster there is no typed-data helper on the SDK, so it
   * falls through to the injected EIP-1193 provider and calls `eth_signTypedData_v4` directly —
   * the same provider `sendTransaction` above ends up using.
   *
   * BigInts are stringified before the call: the payload is JSON-serialised on its way to the
   * wallet and a BigInt throws there, which surfaces as an unhelpful wallet error rather than a
   * signing failure.
   */
  const signTypedData = useCallback(
    async (params: {
      domain: Record<string, unknown>;
      types: Record<string, unknown>;
      primaryType: string;
      message: Record<string, unknown>;
    }): Promise<`0x${string}`> => {
      if (!walletAddress) throw new Error("Wallet not connected");

      if (!isFarcaster) {
        return (await signTypedDataAsync({
          domain: params.domain as any,
          types: params.types as any,
          primaryType: params.primaryType as any,
          message: params.message as any,
        })) as `0x${string}`;
      }

      const provider =
        (farcaster.sdk as any)?.ethereum ||
        (farcaster.sdk as any)?.wallet?.ethProvider ||
        (typeof window !== "undefined" ? (window as any).ethereum : undefined);

      if (!provider?.request) {
        throw new Error(
          "This wallet cannot sign the mint approval. Open the app in a browser wallet to publish.",
        );
      }

      const payload = JSON.stringify(
        {
          domain: params.domain,
          types: params.types,
          primaryType: params.primaryType,
          message: params.message,
        },
        (_k, v) => (typeof v === "bigint" ? v.toString() : v),
      );

      return (await provider.request({
        method: "eth_signTypedData_v4",
        params: [walletAddress, payload],
      })) as `0x${string}`;
    },
    [isFarcaster, walletAddress, signTypedDataAsync, farcaster.sdk],
  );

  // Connect wallet (standalone only)
  const connectWallet = useCallback(() => {
    if (isFarcaster) return; // No-op in Farcaster
    const injected = connectors.find(
      (c) => c.id === "injected" || c.name === "MetaMask",
    );
    if (injected) {
      connect({ connector: injected });
    } else if (connectors[0]) {
      connect({ connector: connectors[0] });
    }
  }, [isFarcaster, connect, connectors]);

  // Disconnect (standalone only)
  const disconnectWallet = useCallback(() => {
    if (isFarcaster) return; // No-op in Farcaster
    wagmiDisconnect();
  }, [isFarcaster, wagmiDisconnect]);

  /**
   * "Connect wallet" for callers that came from the Farcaster-only era.
   *
   * `farcaster.requestWallet` resolves the address the Farcaster client already granted; in a
   * plain browser there is no client, so it logged "No user context" and returned null. Every
   * screen wired to it — the passport modal, /nft, /passport — therefore showed a Connect Wallet
   * button that did nothing, including to people whose wallet was already connected through
   * wagmi. Outside Farcaster this opens the same RainbowKit modal the header uses, and resolves
   * to the already-connected address when there is one.
   */
  const requestWallet = useCallback(async () => {
    if (isFarcaster) return farcaster.requestWallet();

    if (wagmiAccount.isConnected && wagmiAccount.address) {
      return { address: wagmiAccount.address };
    }

    if (openConnectModal) {
      openConnectModal();
      return null;
    }

    connectWallet();
    return null;
  }, [
    isFarcaster,
    farcaster,
    wagmiAccount.isConnected,
    wagmiAccount.address,
    openConnectModal,
    connectWallet,
  ]);

  return {
    walletAddress,
    isConnected,
    isFarcaster,
    loading,

    user: isFarcaster ? farcaster.user : null,
    fid: isFarcaster ? farcaster.fid : undefined,

    sendTransaction,
    signTypedData,
    connectWallet,
    disconnect: disconnectWallet,

    // Backward-compatible Farcaster fields
    sdk: farcaster.sdk,
    context: farcaster.context,
    custodyAddress: farcaster.custodyAddress,
    walletConnected: isConnected,
    isMobile: farcaster.isMobile,
    requestWallet,
    switchChain: farcaster.switchChain,
    error: farcaster.error,
    isLoading: loading,
  };
}
