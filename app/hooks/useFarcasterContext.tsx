'use client';

import { useEffect, useState, useCallback } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';
import { createWalletClient, custom, http, publicActions } from 'viem';
import { monadTestnet } from '@/app/chains';

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
  const [retryCount, setRetryCount] = useState(0);

  const loadUser = useCallback(async () => {
    try {
      console.log('🔄 Loading Farcaster user (attempt ' + (retryCount + 1) + ')...');

      // Detect mobile with more comprehensive check
      const userAgent = navigator.userAgent.toLowerCase();
      const mobile = /mobile|android|iphone|ipad|ipod|warpcast|farcaster/i.test(userAgent) ||
                     ('ontouchstart' in window) ||
                     (navigator.maxTouchPoints > 0);
      setIsMobile(mobile);
      console.log('📱 Is mobile:', mobile, 'UserAgent:', userAgent);

      // Wait for SDK to be available (crucial for mobile)
      let sdkAttempts = 0;
      while ((!sdk || !sdk.context) && sdkAttempts < 20) {
        console.log('⏳ Waiting for SDK...', sdkAttempts);
        await new Promise(resolve => setTimeout(resolve, 500));
        sdkAttempts++;
      }

      if (!sdk || !sdk.context) {
        throw new Error('SDK not available after waiting');
      }

      // Longer timeout for mobile (15 seconds instead of 5)
      const timeoutDuration = mobile ? 15000 : 8000;
      
      const contextPromise = sdk.context;
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`SDK context timeout after ${timeoutDuration/1000} seconds`)), timeoutDuration)
      );

      const context = await Promise.race([contextPromise, timeoutPromise]) as any;

      if (!context) {
        // On mobile, retry a few times before giving up
        if (mobile && retryCount < 3) {
          console.log('🔄 Retrying context load for mobile...');
          setRetryCount(prev => prev + 1);
          setTimeout(() => loadUser(), 2000);
          return;
        }
        throw new Error('SDK returned null context');
      }

      if (!context.user) {
        // Check if we're in a Farcaster frame
        if (mobile && window.parent !== window) {
          console.log('📱 Detected iframe context, waiting for frame message...');
          // Wait for potential frame messages
          await new Promise(resolve => setTimeout(resolve, 2000));
          // Retry once more
          if (retryCount === 0) {
            setRetryCount(1);
            setTimeout(() => loadUser(), 1000);
            return;
          }
        }
        throw new Error('No user data in SDK context');
      }

      const contextUser = context.user as any;

      const farcasterUser: FarcasterUser = {
        fid: contextUser.fid,
        username: contextUser.username,
        displayName: contextUser.displayName,
        pfpUrl: contextUser.pfpUrl,
        custody: contextUser.custody || contextUser.custodyAddress,
        verifiedAddresses: contextUser.verifiedAddresses || contextUser.verified_addresses || [],
      };

      console.log('✅ Farcaster user loaded:', {
        username: farcasterUser.username,
        fid: farcasterUser.fid,
        hasCustody: !!farcasterUser.custody,
        hasVerified: (farcasterUser.verifiedAddresses?.length || 0) > 0,
        mobile
      });

      setUser(farcasterUser);

      // Auto-set wallet with better mobile handling
      let foundWallet = false;

      // On mobile, prioritize custody address
      if (mobile) {
        if (contextUser.custody || contextUser.custodyAddress) {
          const custody = contextUser.custody || contextUser.custodyAddress;
          console.log('✅ Mobile: Using custody address:', custody);
          setWalletAddress(custody);
          foundWallet = true;
        } else if (contextUser.wallet?.address) {
          console.log('✅ Mobile: Using wallet address:', contextUser.wallet.address);
          setWalletAddress(contextUser.wallet.address);
          foundWallet = true;
        }
      }
      
      // Desktop or fallback
      if (!foundWallet) {
        if (contextUser.custody || contextUser.custodyAddress) {
          setWalletAddress(contextUser.custody || contextUser.custodyAddress);
          foundWallet = true;
        } else if (contextUser.verifiedAddresses?.[0]) {
          setWalletAddress(contextUser.verifiedAddresses[0]);
          foundWallet = true;
        } else if (contextUser.verified_addresses?.[0]) {
          setWalletAddress(contextUser.verified_addresses[0]);
          foundWallet = true;
        } else if (!mobile && typeof window !== 'undefined' && (window as any).ethereum) {
          try {
            const accounts = await (window as any).ethereum.request({ method: 'eth_accounts' });
            if (accounts?.[0]) {
              setWalletAddress(accounts[0]);
              foundWallet = true;
            }
          } catch (ethError) {
            console.warn('⚠️ Could not get window.ethereum accounts:', ethError);
          }
        }
      }

      if (!foundWallet) {
        console.warn('⚠️ No wallet address found');
      }

      setError(null);
      setRetryCount(0);
    } catch (err: any) {
      console.error('❌ Failed to load Farcaster user:', err);

      let errorMessage = 'Failed to load user';
      if (err.message?.includes('timeout')) {
        errorMessage = 'Connection timeout. Please refresh the app.';
      } else if (err.message?.includes('No user')) {
        errorMessage = 'Please open this app in Warpcast.';
      } else if (err.message?.includes('SDK not available')) {
        errorMessage = 'Farcaster SDK not loaded. Please refresh.';
      } else if (err.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);
      
      // On mobile, show retry option
      if (isMobile && retryCount < 3) {
        setError(errorMessage + ' (Retrying...)');
        setTimeout(() => {
          setRetryCount(prev => prev + 1);
          loadUser();
        }, 3000);
      }
    } finally {
      setIsLoading(false);
    }
  }, [retryCount, isMobile]);

  useEffect(() => {
    // Delay initial load slightly to ensure SDK is ready
    const timer = setTimeout(() => {
      loadUser();
    }, 500);
    
    return () => clearTimeout(timer);
  }, []);

  const requestWallet = async () => {
    try {
      console.log('🔑 Requesting wallet connection...');
      console.log('📱 Is mobile:', isMobile);

      // Re-check context in case it updated
      const context = await sdk.context;
      const contextUser = context?.user as any;

      if (contextUser?.custody || contextUser?.custodyAddress) {
        setWalletAddress(contextUser.custody || contextUser.custodyAddress);
        setError(null);
        return;
      }

      if (contextUser?.wallet?.address) {
        setWalletAddress(contextUser.wallet.address);
        setError(null);
        return;
      }

      if (contextUser?.verifiedAddresses?.[0]) {
        setWalletAddress(contextUser.verifiedAddresses[0]);
        setError(null);
        return;
      }

      if (!isMobile && typeof window !== 'undefined' && (window as any).ethereum) {
        const accounts = await (window as any).ethereum.request({
          method: 'eth_requestAccounts',
        });
        if (accounts?.[0]) {
          setWalletAddress(accounts[0]);
          setError(null);
          return;
        }
      }

      throw new Error('No wallet address available. Please verify an address in Warpcast settings.');
    } catch (err: any) {
      console.error('❌ Wallet connection error:', err);
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
      if (!walletAddress) {
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
        account: walletAddress as `0x${string}`,
        to: params.to as `0x${string}`,
        value: params.value,
        data: params.data as `0x${string}` | undefined,
        gas: params.gasLimit ? BigInt(params.gasLimit) : undefined,
      });

      return {
        hash: txHash,
        wait: async () => {
          const receipt = await client.waitForTransactionReceipt({
            hash: txHash,
            confirmations: 1,
          });
        },
      };
    } catch (err: any) {
      throw new Error(err.message || 'Failed to send transaction');
    }
  };

  const switchChain = async (params: { chainId: number }) => {
    try {
      if (isMobile) {
        if (params.chainId !== monadTestnet.id) {
          throw new Error(`Mobile wallet is on Monad Testnet. Cannot switch chains.`);
        }
        return;
      }

      if (typeof window !== 'undefined' && (window as any).ethereum) {
        await (window as any).ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${params.chainId.toString(16)}` }],
        });
      }
    } catch (err: any) {
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
