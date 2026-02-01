'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAccount, useConnect, useDisconnect, useSendTransaction, useWriteContract } from 'wagmi';
import { useFarcasterContext } from './useFarcasterContext';

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
    : wagmiAccount.address ?? null;

  const isConnected = isFarcaster
    ? !!farcaster.walletAddress
    : wagmiAccount.isConnected;

  const loading = farcaster.loading;

  // Unified sendTransaction
  const sendTransaction = useCallback(async (params: any) => {
    if (isFarcaster) {
      return farcaster.sendTransaction(params);
    }

    // Standalone: use wagmi sendTransaction
    if (!wagmiAccount.isConnected) {
      throw new Error('Wallet not connected');
    }

    try {
      // For native token transfers (no data)
      if (!params.data && params.value && params.to) {
        const hash = await sendTransactionAsync({
          to: params.to as `0x${string}`,
          value: typeof params.value === 'string' && params.value.startsWith('0x')
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

      throw new Error('Invalid transaction parameters');
    } catch (error: any) {
      console.error('[WalletContext] Standalone sendTransaction error:', error);
      throw error;
    }
  }, [isFarcaster, farcaster, wagmiAccount.isConnected, sendTransactionAsync]);

  // Connect wallet (standalone only)
  const connectWallet = useCallback(() => {
    if (isFarcaster) return; // No-op in Farcaster
    const injected = connectors.find(c => c.id === 'injected' || c.name === 'MetaMask');
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

  return {
    walletAddress,
    isConnected,
    isFarcaster,
    loading,

    user: isFarcaster ? farcaster.user : null,
    fid: isFarcaster ? farcaster.fid : undefined,

    sendTransaction,
    connectWallet,
    disconnect: disconnectWallet,

    // Backward-compatible Farcaster fields
    sdk: farcaster.sdk,
    context: farcaster.context,
    custodyAddress: farcaster.custodyAddress,
    walletConnected: isConnected,
    isMobile: farcaster.isMobile,
    requestWallet: farcaster.requestWallet,
    switchChain: farcaster.switchChain,
    error: farcaster.error,
    isLoading: loading,
  };
}
