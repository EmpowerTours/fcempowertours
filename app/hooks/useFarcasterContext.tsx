'use client';
import { useEffect, useState, useCallback } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';
import { createWalletClient, custom, http, publicActions } from 'viem';
import { monadTestnet } from '@/app/chains';
import { useAccount } from 'wagmi';

interface FarcasterUser {
  fid: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
}

interface FarcasterContext {
  user: FarcasterUser | null;
  walletAddress: string | null;
  isLoading: boolean;
  error: string | null;
  isMobile: boolean;
  requestWallet: () => Promise<void>;
  sendTransaction: (params: {
    to: string;
    value: bigint;
    data?: string;
    gasLimit?: number;
  }) => Promise<{ hash: string; wait: () => Promise<void> }>;
  switchChain: (params: { chainId: number }) => Promise<void>;
}

export function useFarcasterContext(): FarcasterContext {
  const { address: wagmiAddress, isConnected } = useAccount();
  const [user, setUser] = useState<FarcasterUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isDesktopWithoutFarcaster, setIsDesktopWithoutFarcaster] = useState(false);
  const [isInMiniApp, setIsInMiniApp] = useState(false);

  const loadUser = useCallback(async () => {
    try {
      console.log('🔄 Loading user context...');
      // Detect platform
      const userAgent = navigator.userAgent.toLowerCase();
      const mobile = /mobile|android|iphone|ipad|ipod|warpcast|farcaster/i.test(userAgent) ||
                     ('ontouchstart' in window) ||
                     (navigator.maxTouchPoints > 0) ||
                     (window.matchMedia && window.matchMedia('(max-width: 768px)').matches);
      setIsMobile(mobile);
      console.log('📱 Platform:', mobile ? 'Mobile' : 'Desktop');

      // Check if in Mini App
      let miniAppStatus = false;
      try {
        miniAppStatus = await sdk.isInMiniApp();
        setIsInMiniApp(miniAppStatus);
      } catch (err) {
        console.warn('⚠️ Failed to check isInMiniApp:', err);
      }

      if (!miniAppStatus) {
        setError('Please open this app in Warpcast or another Farcaster client.');
        setIsLoading(false);
        return;
      }

      // Wait for SDK readiness
      let sdkAttempts = 0;
      const maxSdkAttempts = mobile ? 20 : 5;
      while ((!sdk || !sdk.context || !sdk.context.user) && sdkAttempts < maxSdkAttempts) {
        await new Promise(resolve => setTimeout(resolve, 200));
        sdkAttempts++;
      }

      if (sdk && sdk.context && sdk.context.user) {
        const contextUser = sdk.context.user;
        const farcasterUser: FarcasterUser = {
          fid: contextUser.fid,
          username: contextUser.username,
          displayName: contextUser.displayName,
          pfpUrl: contextUser.pfpUrl,
        };
        setUser(farcasterUser);
        console.log('✅ Farcaster user loaded:', farcasterUser.username);
      } else {
        console.warn('⚠️ SDK context not available after retries');
        if (mobile) {
          setError('Failed to load Farcaster context. Please refresh.');
        } else {
          setIsDesktopWithoutFarcaster(true);
        }
      }

      // Wallet is handled by Wagmi
      if (isConnected && wagmiAddress) {
        setError(null);
        console.log('✅ Wallet connected via Wagmi:', wagmiAddress.substring(0, 10) + '...');
      } else if (mobile) {
        setError('No wallet found. Please verify an address in Warpcast settings.');
      } else {
        // On desktop, allow manual connection
        setError(null);
      }

    } catch (err: any) {
      console.error('❌ Failed to load user context:', err);
      setError(mobile ? 'Failed to load. Please refresh the app.' : null);
      if (!mobile) {
        setIsDesktopWithoutFarcaster(true);
      }
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, wagmiAddress, isMobile]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadUser();
    }, 500);
    return () => clearTimeout(timer);
  }, [loadUser]);

  const requestWallet = async () => {
    // Since using Wagmi connector, connection is automatic if verified
    // For manual connect on desktop, use Wagmi's useConnect
    // But for simplicity, if not connected, show error
    if (!isConnected) {
      if (isMobile) {
        throw new Error('No wallet found. Please verify an address in Warpcast settings.');
      } else {
        throw new Error('Please connect your wallet via MetaMask or similar.');
      }
    }
  };

  const sendTransaction = async (params: {
    to: string;
    value: bigint;
    data?: string;
    gasLimit?: number;
  }) => {
    try {
      console.log('📤 Sending transaction:', params);
      if (!wagmiAddress) {
        throw new Error('No wallet address available');
      }
      const transport = isMobile
        ? http('https://testnet-rpc.monad.xyz')
        : custom((window as any).ethereum);
      const client = createWalletClient({
        chain: monadTestnet,
        transport,
      }).extend(publicActions);
      const txHash = await client.sendTransaction({
        account: wagmiAddress as `0x${string}`,
        to: params.to as `0x${string}`,
        value: params.value,
        data: params.data as `0x${string}` | undefined,
        gas: params.gasLimit ? BigInt(params.gasLimit) : undefined,
      });
      console.log('✅ Transaction sent:', txHash);
      return {
        hash: txHash,
        wait: async () => {
          console.log('⏳ Waiting for transaction confirmation...');
          const receipt = await client.waitForTransactionReceipt({
            hash: txHash,
            confirmations: 1,
          });
          console.log('✅ Transaction confirmed');
        },
      };
    } catch (err: any) {
      console.error('❌ Transaction error:', err);
      throw new Error(err.message || 'Failed to send transaction');
    }
  };

  const switchChain = async (params: { chainId: number }) => {
    try {
      console.log('🔄 Switching chain to:', params.chainId);
      if (isMobile) {
        if (params.chainId !== monadTestnet.id) {
          throw new Error(`Mobile wallet is on Monad Testnet. Cannot switch chains.`);
        }
        return;
      }
      if (typeof window !== 'undefined' && (window as any).ethereum) {
        try {
          await (window as any).ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${params.chainId.toString(16)}` }],
          });
        } catch (switchError: any) {
          if (switchError.code === 4902) {
            await (window as any).ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: `0x${params.chainId.toString(16)}`,
                chainName: monadTestnet.name,
                nativeCurrency: monadTestnet.nativeCurrency,
                rpcUrls: [monadTestnet.rpcUrls.default.http[0]],
                blockExplorerUrls: [monadTestnet.blockExplorers?.default.url],
              }],
            });
          } else {
            throw switchError;
          }
        }
      }
    } catch (err: any) {
      console.error('❌ Chain switch error:', err);
      throw new Error(err.message || 'Failed to switch chain');
    }
  };

  return {
    user,
    walletAddress: wagmiAddress || null,
    isLoading,
    error,
    isMobile,
    requestWallet,
    sendTransaction,
    switchChain,
  };
}
