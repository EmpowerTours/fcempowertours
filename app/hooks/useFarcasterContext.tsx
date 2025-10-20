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

      // Comprehensive mobile detection
      const userAgent = navigator.userAgent.toLowerCase();
      const mobile = /mobile|android|iphone|ipad|ipod|warpcast|farcaster/i.test(userAgent) ||
                     ('ontouchstart' in window) ||
                     (navigator.maxTouchPoints > 0) ||
                     (window.matchMedia && window.matchMedia('(max-width: 768px)').matches);
      setIsMobile(mobile);
      console.log('📱 Is mobile:', mobile, 'UserAgent:', userAgent.substring(0, 50) + '...');

      // Wait for SDK to be available (crucial for mobile)
      let sdkAttempts = 0;
      const maxSdkAttempts = mobile ? 30 : 20; // More attempts on mobile
      
      while ((!sdk || !sdk.context) && sdkAttempts < maxSdkAttempts) {
        console.log('⏳ Waiting for SDK context...', sdkAttempts + 1, '/', maxSdkAttempts);
        await new Promise(resolve => setTimeout(resolve, 500));
        sdkAttempts++;
      }

      if (!sdk || !sdk.context) {
        throw new Error(`SDK not available after ${maxSdkAttempts} attempts`);
      }

      // Longer timeout for mobile (20 seconds instead of 5)
      const timeoutDuration = mobile ? 20000 : 10000;
      
      console.log('🔍 Getting SDK context with timeout:', timeoutDuration / 1000, 'seconds');
      
      const contextPromise = sdk.context;
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`SDK context timeout after ${timeoutDuration/1000} seconds`)), timeoutDuration)
      );

      const context = await Promise.race([contextPromise, timeoutPromise]);

      if (!context) {
        // On mobile, retry a few times before giving up
        if (mobile && retryCount < 5) {
          console.log('🔄 Retrying context load for mobile (attempt', retryCount + 2, ')...');
          setRetryCount(prev => prev + 1);
          setTimeout(() => loadUser(), 3000);
          return;
        }
        throw new Error('SDK returned null context after retries');
      }

      // Cast to any to avoid TypeScript issues with SDK types
      const contextAny = context as any;

      console.log('📦 Context received:', {
        hasContext: !!contextAny,
        hasUser: !!contextAny?.user,
        userKeys: contextAny?.user ? Object.keys(contextAny.user) : [],
      });

      if (!contextAny.user) {
        // Check if we're in a Farcaster frame
        if (mobile && window.parent !== window) {
          console.log('📱 Detected iframe context, waiting for frame message...');
          // Wait for potential frame messages
          await new Promise(resolve => setTimeout(resolve, 3000));
          // Retry once more
          if (retryCount < 3) {
            setRetryCount(prev => prev + 1);
            setTimeout(() => loadUser(), 2000);
            return;
          }
        }
        throw new Error('No user data in SDK context');
      }

      const contextUser = contextAny.user;

      // Extract all possible wallet addresses (handle various property names)
      const custody = contextUser.custody || 
                     contextUser.custodyAddress || 
                     contextUser.custody_address ||
                     contextUser.wallet?.address ||
                     contextUser.wallet_address ||
                     null;
                     
      const verifiedAddresses = contextUser.verifiedAddresses || 
                              contextUser.verified_addresses || 
                              contextUser.verifiedWallets ||
                              [];

      const farcasterUser: FarcasterUser = {
        fid: contextUser.fid || contextUser.id,
        username: contextUser.username || contextUser.name,
        displayName: contextUser.displayName || contextUser.display_name,
        pfpUrl: contextUser.pfpUrl || contextUser.pfp_url || contextUser.profileImage,
        custody: custody,
        verifiedAddresses: Array.isArray(verifiedAddresses) ? verifiedAddresses : [],
      };

      console.log('✅ Farcaster user loaded:', {
        username: farcasterUser.username,
        fid: farcasterUser.fid,
        hasCustody: !!farcasterUser.custody,
        custodyAddress: farcasterUser.custody ? farcasterUser.custody.substring(0, 10) + '...' : 'none',
        hasVerified: (farcasterUser.verifiedAddresses?.length || 0) > 0,
        mobile
      });

      setUser(farcasterUser);

      // Auto-set wallet with better mobile handling
      let foundWallet = false;

      // On mobile, prioritize custody address
      if (custody) {
        console.log('✅ Using custody/wallet address:', custody.substring(0, 10) + '...');
        setWalletAddress(custody);
        foundWallet = true;
      } else if (verifiedAddresses.length > 0) {
        console.log('✅ Using verified address:', verifiedAddresses[0].substring(0, 10) + '...');
        setWalletAddress(verifiedAddresses[0]);
        foundWallet = true;
      } else if (!mobile && typeof window !== 'undefined' && (window as any).ethereum) {
        try {
          const accounts = await (window as any).ethereum.request({ method: 'eth_accounts' });
          if (accounts?.[0]) {
            console.log('✅ Using MetaMask account:', accounts[0].substring(0, 10) + '...');
            setWalletAddress(accounts[0]);
            foundWallet = true;
          }
        } catch (ethError) {
          console.warn('⚠️ Could not get window.ethereum accounts:', ethError);
        }
      }

      if (!foundWallet) {
        console.warn('⚠️ No wallet address found - user may need to connect one');
        setError('Please connect a wallet to use this feature');
      } else {
        setError(null);
      }
      
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
      if (isMobile && retryCount < 5) {
        setError(errorMessage + ' (Retrying automatically...)');
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
    }, 1000);
    
    return () => clearTimeout(timer);
  }, []);

  const requestWallet = async () => {
    try {
      console.log('🔑 Requesting wallet connection...');
      console.log('📱 Is mobile:', isMobile);

      // Re-check context in case it updated - cast to any
      const context = await sdk.context as any;
      const contextUser = context?.user;

      const custody = contextUser?.custody || 
                     contextUser?.custodyAddress || 
                     contextUser?.custody_address ||
                     contextUser?.wallet?.address ||
                     null;

      if (custody) {
        console.log('✅ Found custody address:', custody.substring(0, 10) + '...');
        setWalletAddress(custody);
        setError(null);
        return;
      }

      const verifiedAddresses = contextUser?.verifiedAddresses || 
                              contextUser?.verified_addresses || 
                              [];

      if (verifiedAddresses?.[0]) {
        console.log('✅ Found verified address:', verifiedAddresses[0].substring(0, 10) + '...');
        setWalletAddress(verifiedAddresses[0]);
        setError(null);
        return;
      }

      if (!isMobile && typeof window !== 'undefined' && (window as any).ethereum) {
        const accounts = await (window as any).ethereum.request({
          method: 'eth_requestAccounts',
        });
        if (accounts?.[0]) {
          console.log('✅ Connected MetaMask:', accounts[0].substring(0, 10) + '...');
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
      console.log('📤 Sending transaction:', params);

      if (!walletAddress) {
        throw new Error('No wallet address available');
      }

      // Use HTTP transport for mobile, custom provider for desktop
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
                blockExplorerUrls: [monadTestnet.blockExplorers?.default.url],
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
