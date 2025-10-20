'use client';

import { useEffect, useState } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';
import { createWalletClient, custom, http, publicActions } from 'viem';
import { monadTestnet } from '@/app/chains'; // Import from your custom chains file

interface FarcasterUser {
  fid: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
  custody?: string;
  verifiedAddresses?: string[];
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
  const [user, setUser] = useState<FarcasterUser | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const loadUser = async () => {
      try {
        console.log('🔄 Loading Farcaster user...');

        // Better mobile detection
        const userAgent = navigator.userAgent.toLowerCase();
        const mobile = /mobile|android|iphone|ipad|ipod|warpcast/.test(userAgent);
        setIsMobile(mobile);
        console.log('📱 Is mobile:', mobile, 'UserAgent:', userAgent);

        // Add timeout for SDK context loading
        const contextPromise = sdk.context;
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('SDK context timeout after 5 seconds')), 5000)
        );

        const context = await Promise.race([contextPromise, timeoutPromise]) as any;

        if (!context) {
          throw new Error('SDK returned null context');
        }

        if (!context.user) {
          throw new Error('No user data in SDK context');
        }

        // Type assertion to handle custody address
        const contextUser = context.user as any;

        const farcasterUser: FarcasterUser = {
          fid: contextUser.fid,
          username: contextUser.username,
          displayName: contextUser.displayName,
          pfpUrl: contextUser.pfpUrl,
          custody: contextUser.custody,
          verifiedAddresses: contextUser.verifiedAddresses || [],
        };

        console.log('✅ Farcaster user loaded:', {
          username: farcasterUser.username,
          fid: farcasterUser.fid,
          hasCustody: !!farcasterUser.custody,
          hasVerified: (farcasterUser.verifiedAddresses?.length || 0) > 0,
        });

        setUser(farcasterUser);

        // Auto-set wallet - Try ALL methods
        let foundWallet = false;

        // Priority 1: Custody address
        if (contextUser.custody) {
          console.log('✅ Using custody address:', contextUser.custody);
          setWalletAddress(contextUser.custody);
          foundWallet = true;
        }
        // Priority 2: Verified addresses
        else if (contextUser.verifiedAddresses?.[0]) {
          console.log('✅ Using verified address:', contextUser.verifiedAddresses[0]);
          setWalletAddress(contextUser.verifiedAddresses[0]);
          foundWallet = true;
        }
        // Priority 3: Try window.ethereum (desktop)
        else if (!mobile && typeof window !== 'undefined' && (window as any).ethereum) {
          try {
            const accounts = await (window as any).ethereum.request({ method: 'eth_accounts' });
            if (accounts?.[0]) {
              console.log('✅ Using window.ethereum account:', accounts[0]);
              setWalletAddress(accounts[0]);
              foundWallet = true;
            }
          } catch (ethError) {
            console.warn('⚠️ Could not get window.ethereum accounts:', ethError);
          }
        }

        if (!foundWallet) {
          console.warn('⚠️ No wallet address found');
        }

        setError(null);
      } catch (err: any) {
        console.error('❌ Failed to load Farcaster user:', err);

        let errorMessage = 'Failed to load user';
        if (err.message?.includes('timeout')) {
          errorMessage = 'Connection timeout. Please refresh the app.';
        } else if (err.message?.includes('No user')) {
          errorMessage = 'Please open this app in Warpcast.';
        } else if (err.message) {
          errorMessage = err.message;
        }

        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    loadUser();
  }, []);

  const requestWallet = async () => {
    try {
      console.log('🔑 Requesting wallet connection...');
      console.log('📱 Is mobile:', isMobile);

      // Get fresh context
      const context = await sdk.context;
      const contextUser = context.user as any;

      // Try all methods in order
      if (contextUser?.custody) {
        console.log('✅ Using custody address:', contextUser.custody);
        setWalletAddress(contextUser.custody);
        setError(null);
        return;
      }

      if (contextUser?.verifiedAddresses?.[0]) {
        console.log('✅ Using verified address:', contextUser.verifiedAddresses[0]);
        setWalletAddress(contextUser.verifiedAddresses[0]);
        setError(null);
        return;
      }

      if (!isMobile && typeof window !== 'undefined' && (window as any).ethereum) {
        console.log('💻 Requesting from window.ethereum...');
        try {
          const accounts = await (window as any).ethereum.request({
            method: 'eth_requestAccounts',
          });

          if (accounts?.[0]) {
            console.log('✅ External wallet connected:', accounts[0]);
            setWalletAddress(accounts[0] as string);
            setError(null);
            return;
          }
        } catch (ethError: any) {
          if (ethError.code === 4001) {
            console.log('User rejected wallet connection');
            return;
          }
          console.warn('⚠️ window.ethereum error:', ethError);
        }
      }

      throw new Error('No wallet address available. Please connect a wallet or verify an address in Warpcast settings.');
    } catch (err: any) {
      console.error('❌ Wallet connection error:', err);

      if (err.code === 4001 || err.message?.includes('rejected')) {
        console.log('User rejected wallet connection');
        return;
      }

      setError(err.message || 'Unable to connect wallet. Please try again.');
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

      if (!walletAddress) {
        throw new Error('No wallet address available');
      }

      // Create transport based on environment
      const transport = isMobile 
        ? http('https://testnet-rpc.monad.xyz')
        : custom((window as any).ethereum);

      // Initialize viem wallet client with public actions for waitForTransactionReceipt
      const client = createWalletClient({
        chain: monadTestnet,
        transport,
      }).extend(publicActions);

      const txHash = await client.sendTransaction({
        account: walletAddress as `0x${string}`,
        to: params.to as `0x${string}`,
        value: params.value,
        data: params.data as `0x${string}` | undefined,
        gas: params.gasLimit ? BigInt(params.gasLimit) : undefined,
      });

      console.log('✅ Transaction sent:', txHash);

      return {
        hash: txHash,
        wait: async () => {
          console.log('⏳ Waiting for transaction confirmation:', txHash);
          const receipt = await client.waitForTransactionReceipt({
            hash: txHash,
            confirmations: 1,
          });
          console.log('✅ Transaction confirmed:', receipt);
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

      // On mobile, we can't switch chains - just verify we're on the right one
      if (isMobile) {
        if (params.chainId !== monadTestnet.id) {
          throw new Error(`Mobile wallet is on Monad Testnet (${monadTestnet.id}). Cannot switch to chain ${params.chainId}`);
        }
        console.log('✅ Already on correct chain (mobile)');
        return;
      }

      // Desktop: switch chain via window.ethereum
      if (typeof window !== 'undefined' && (window as any).ethereum) {
        try {
          await (window as any).ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${params.chainId.toString(16)}` }],
          });
          console.log('✅ Switched to chain:', params.chainId);
        } catch (switchError: any) {
          // Chain not added, try adding it
          if (switchError.code === 4902) {
            await (window as any).ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: `0x${params.chainId.toString(16)}`,
                chainName: monadTestnet.name,
                nativeCurrency: monadTestnet.nativeCurrency,
                rpcUrls: [monadTestnet.rpcUrls.default.http[0]],
                blockExplorerUrls: [monadTestnet.blockExplorers.default.url],
              }],
            });
            console.log('✅ Added and switched to chain:', params.chainId);
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
    walletAddress,
    isLoading,
    error,
    isMobile,
    requestWallet,
    sendTransaction,
    switchChain,
  };
}
