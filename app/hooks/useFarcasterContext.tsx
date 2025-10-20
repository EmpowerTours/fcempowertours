'use client';
import { useEffect, useState, useCallback } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';
import { publicActions } from 'viem';
import { useWalletClient } from 'wagmi';
import { monadTestnet } from '@/app/chains';
import { useAccount, useConnect, useConnectors, useSwitchChain } from 'wagmi';

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
  const { connect } = useConnect();
  const connectors = useConnectors();
  const { switchChain: wagmiSwitchChain } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const [user, setUser] = useState<FarcasterUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isDesktopWithoutFarcaster, setIsDesktopWithoutFarcaster] = useState(false);
  const [isInMiniApp, setIsInMiniApp] = useState(false);

  const loadUser = useCallback(async () => {
    let mobile = false;
    try {
      console.log('🔄 Loading user context...');
      // Detect platform
      const userAgent = navigator.userAgent.toLowerCase();
      mobile = /mobile|android|iphone|ipad|ipod|warpcast|farcaster/i.test(userAgent) ||
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

      if (!miniAppStatus && mobile) {
        setError('Please open this app in Warpcast or another Farcaster client.');
        setIsLoading(false);
        return;
      }

      if (miniAppStatus) {
        // Wait for SDK readiness
        let sdkAttempts = 0;
        const maxSdkAttempts = mobile ? 20 : 5;
        let contextUser;
        while (sdkAttempts < maxSdkAttempts) {
          try {
            const context = await sdk.context;
            if (context && context.user) {
              contextUser = context.user;
              break;
            }
          } catch {}
          await new Promise(resolve => setTimeout(resolve, 200));
          sdkAttempts++;
        }

        if (contextUser) {
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
            setUser({
              fid: 0,
              username: 'Desktop User',
              displayName: 'Desktop User',
            });
          }
        }
      } else {
        // Desktop mode
        setIsDesktopWithoutFarcaster(true);
        setUser({
          fid: 0,
          username: 'Desktop User',
          displayName: 'Desktop User',
        });
      }

      // Wallet is handled by Wagmi
      if (isConnected && wagmiAddress) {
        console.log('✅ Wallet connected via Wagmi:', wagmiAddress.substring(0, 10) + '...');
        setError(null);
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
    try {
      if (isConnected) {
        return;
      }
      const connectorId = isMobile ? 'farcasterMiniApp' : 'injected';
      const targetConnector = connectors.find(c => c.id === connectorId);
      if (!targetConnector) {
        throw new Error(`${connectorId} connector not found`);
      }
      connect({ connector: targetConnector });
    } catch (err: any) {
      console.error('❌ Wallet connection error:', err);
      setError(err.message || 'Unable to connect wallet');
    }
  };

  const sendTransaction = async (params: {
    to: string;
    value: bigint;
    data?: string;
    gasLimit?: number;
  }) => {
    if (!walletClient) {
      throw new Error('No wallet client available');
    }
    if (!wagmiAddress) {
      throw new Error('No wallet address available');
    }
    const client = walletClient.extend(publicActions);
    const txHash = await client.sendTransaction({
      account: wagmiAddress as `0x${string}`,
      chain: monadTestnet,
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
  };

  const switchChain = async (params: { chainId: number }) => {
    try {
      if (isMobile && params.chainId !== monadTestnet.id) {
        throw new Error(`Mobile wallet is on Monad Testnet. Cannot switch chains.`);
      }
      wagmiSwitchChain({ chainId: params.chainId as any });
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
