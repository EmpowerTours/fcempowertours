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
  const [isDesktopWithoutFarcaster, setIsDesktopWithoutFarcaster] = useState(false);

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

      // Check if we're in a Farcaster frame
      const inFrame = window.parent !== window;
      
      // Try to get Farcaster context (will fail on desktop outside of frame)
      let farcasterUser: FarcasterUser | null = null;
      let contextAvailable = false;
      
      try {
        // Wait for SDK with shorter timeout on desktop
        let sdkAttempts = 0;
        const maxSdkAttempts = mobile ? 20 : 5;
        
        while ((!sdk || !sdk.context) && sdkAttempts < maxSdkAttempts) {
          await new Promise(resolve => setTimeout(resolve, 200));
          sdkAttempts++;
        }

        if (sdk && sdk.context) {
          const context = await sdk.context as any;
          
          if (context?.user) {
            contextAvailable = true;
            const contextUser = context.user;
            
            const custody = contextUser.custody || 
                         contextUser.custodyAddress || 
                         contextUser.custody_address ||
                         contextUser.wallet?.address ||
                         null;
                         
            const verifiedAddresses = contextUser.verifiedAddresses || 
                                    contextUser.verified_addresses || 
                                    [];

            farcasterUser = {
              fid: contextUser.fid || contextUser.id,
              username: contextUser.username || contextUser.name,
              displayName: contextUser.displayName || contextUser.display_name,
              pfpUrl: contextUser.pfpUrl || contextUser.pfp_url || contextUser.profileImage,
              custody: custody,
              verifiedAddresses: Array.isArray(verifiedAddresses) ? verifiedAddresses : [],
            };

            setUser(farcasterUser);
            console.log('✅ Farcaster user loaded:', farcasterUser.username);

            // Set wallet from Farcaster context
            if (custody) {
              setWalletAddress(custody);
              setError(null);
            } else if (verifiedAddresses.length > 0) {
              setWalletAddress(verifiedAddresses[0]);
              setError(null);
            }
          }
        }
      } catch (sdkError) {
        console.log('ℹ️ Farcaster SDK not available (expected on desktop)');
      }

      // If no Farcaster context and we're on desktop, try MetaMask
      if (!contextAvailable && !mobile) {
        console.log('🖥️ Desktop mode - checking for MetaMask...');
        setIsDesktopWithoutFarcaster(true);
        
        if (typeof window !== 'undefined' && (window as any).ethereum) {
          try {
            const accounts = await (window as any).ethereum.request({ 
              method: 'eth_accounts' 
            });
            
            if (accounts?.[0]) {
              console.log('✅ Found MetaMask account:', accounts[0].substring(0, 10) + '...');
              setWalletAddress(accounts[0]);
              
              // Create a mock user for desktop
              setUser({
                fid: 0,
                username: 'Desktop User',
                displayName: 'Desktop User',
                verifiedAddresses: [accounts[0]],
              });
              
              setError(null);
            } else {
              console.log('ℹ️ MetaMask found but not connected');
              // Don't set error - user can connect manually
              setError(null);
            }
          } catch (ethError) {
            console.log('ℹ️ MetaMask not available or error:', ethError);
            setError(null); // Don't show error, just allow manual connection
          }
        } else {
          console.log('ℹ️ No Web3 wallet detected');
          setError(null); // Don't error, allow manual wallet connection
        }
      }
      
      // Only show error if we're on mobile and expected Farcaster but didn't get it
      if (!contextAvailable && mobile && inFrame) {
        setError('Please open this app in Warpcast');
      }
      
    } catch (err: any) {
      console.error('❌ Failed to load user context:', err);
      
      // Only set error for critical failures
      if (isMobile) {
        setError('Failed to load. Please refresh the app.');
      } else {
        // On desktop, don't error - allow manual wallet connection
        setError(null);
        setIsDesktopWithoutFarcaster(true);
      }
    } finally {
      setIsLoading(false);
    }
  }, [isMobile]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadUser();
    }, 500);
    
    return () => clearTimeout(timer);
  }, []);

  const requestWallet = async () => {
    try {
      console.log('🔑 Requesting wallet connection...');

      // If we already have a wallet, return
      if (walletAddress) {
        console.log('✅ Wallet already connected:', walletAddress.substring(0, 10) + '...');
        return;
      }

      // Try Farcaster context first (if available)
      if (user?.custody) {
        setWalletAddress(user.custody);
        setError(null);
        return;
      }

      if (user?.verifiedAddresses?.[0]) {
        setWalletAddress(user.verifiedAddresses[0]);
        setError(null);
        return;
      }

      // Try MetaMask on desktop
      if (!isMobile && typeof window !== 'undefined' && (window as any).ethereum) {
        const accounts = await (window as any).ethereum.request({
          method: 'eth_requestAccounts',
        });
        
        if (accounts?.[0]) {
          console.log('✅ Connected MetaMask:', accounts[0].substring(0, 10) + '...');
          setWalletAddress(accounts[0]);
          
          // Update or create user if needed
          if (!user) {
            setUser({
              fid: 0,
              username: 'Desktop User',
              displayName: 'Desktop User',
              verifiedAddresses: [accounts[0]],
            });
          }
          
          setError(null);
          return;
        }
      }

      // If we get here and still no wallet, show appropriate message
      if (isMobile) {
        throw new Error('No wallet found. Please verify an address in Warpcast settings.');
      } else {
        throw new Error('Please install MetaMask or another Web3 wallet');
      }
      
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

      if (isMobile) {
        if (params.chainId !== monadTestnet.id) {
          throw new Error(`Mobile wallet is on Monad Testnet. Cannot switch chains.`);
        }
        return;
      }

      // Desktop: switch chain via window.ethereum
      if (typeof window !== 'undefined' && (window as any).ethereum) {
        try {
          await (window as any).ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${params.chainId.toString(16)}` }],
          });
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

  // For desktop without Farcaster, create a minimal working context
  if (isDesktopWithoutFarcaster && !user && !isLoading) {
    return {
      user: {
        fid: 0,
        username: 'Desktop User',
        displayName: 'Desktop User',
      },
      walletAddress,
      isLoading: false,
      error: null,
      isMobile: false,
      requestWallet,
      sendTransaction,
      switchChain,
    };
  }

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
