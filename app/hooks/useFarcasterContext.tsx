// app/hooks/useFarcasterContext.tsx
// FIXED: Mobile wallet connection with custody address

'use client';

import { useEffect, useState } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';

interface FarcasterUser {
  fid: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
  custody?: string; // Custody address
  verifiedAddresses?: string[]; // Connected addresses
}

interface FarcasterContext {
  user: FarcasterUser | null;
  walletAddress: string | null;
  isLoading: boolean;
  error: string | null;
  isMobile: boolean;
  requestWallet: () => Promise<void>;
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
        
        // Detect mobile
        const userAgent = navigator.userAgent.toLowerCase();
        const mobile = /mobile|android|iphone|ipad|ipod/.test(userAgent);
        setIsMobile(mobile);
        console.log('📱 Is mobile:', mobile);
        
        // Load context
        const context = await sdk.context;
        
        if (context?.user) {
          const farcasterUser: FarcasterUser = {
            fid: context.user.fid,
            username: context.user.username,
            displayName: context.user.displayName,
            pfpUrl: context.user.pfpUrl,
            custody: context.user.custody, // Custody address
            verifiedAddresses: context.user.verifiedAddresses || [],
          };
          
          console.log('✅ Farcaster user loaded:', {
            username: farcasterUser.username,
            fid: farcasterUser.fid,
            custody: farcasterUser.custody,
            verified: farcasterUser.verifiedAddresses?.length || 0,
          });
          
          setUser(farcasterUser);
          
          // CRITICAL FIX: Auto-set wallet on mobile
          if (mobile) {
            // On mobile: Use custody address immediately
            if (context.user.custody) {
              console.log('📱 Mobile: Using custody address:', context.user.custody);
              setWalletAddress(context.user.custody);
            } else if (context.user.verifiedAddresses?.[0]) {
              console.log('📱 Mobile: Using verified address:', context.user.verifiedAddresses[0]);
              setWalletAddress(context.user.verifiedAddresses[0]);
            }
          } else {
            // On desktop: Use verified address if available
            if (context.user.verifiedAddresses?.[0]) {
              console.log('💻 Desktop: Using verified address:', context.user.verifiedAddresses[0]);
              setWalletAddress(context.user.verifiedAddresses[0]);
            }
          }
          
          setError(null);
        } else {
          console.warn('⚠️ No user in context');
        }
        
      } catch (err: any) {
        console.error('❌ Failed to load Farcaster user:', err);
        setError(err.message || 'Failed to load user');
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
      
      if (isMobile) {
        // MOBILE: Cannot request external wallet, use custody address
        console.log('📱 Mobile detected: Using Farcaster custody address');
        
        const context = await sdk.context;
        
        if (context.user.custody) {
          console.log('✅ Using custody address:', context.user.custody);
          setWalletAddress(context.user.custody);
          return;
        }
        
        if (context.user.verifiedAddresses?.[0]) {
          console.log('✅ Using verified address:', context.user.verifiedAddresses[0]);
          setWalletAddress(context.user.verifiedAddresses[0]);
          return;
        }
        
        throw new Error('No wallet address available. Please verify an address in Warpcast settings.');
      }
      
      // DESKTOP: Try to connect external wallet
      console.log('💻 Desktop: Checking for ethereum provider...');
      
      if (typeof window !== 'undefined' && window.ethereum) {
        console.log('✅ Ethereum provider found');
        const accounts = await window.ethereum.request({
          method: 'eth_requestAccounts'
        });
        
        if (accounts && accounts[0]) {
          setWalletAddress(accounts[0] as string);
          console.log('✅ External wallet connected:', accounts[0]);
          return;
        }
      }
      
      // Fallback: Use Farcaster addresses
      console.log('⚠️ No external wallet, using Farcaster address');
      const context = await sdk.context;
      
      if (context.user.verifiedAddresses?.[0]) {
        console.log('✅ Using verified address:', context.user.verifiedAddresses[0]);
        setWalletAddress(context.user.verifiedAddresses[0]);
      } else if (context.user.custody) {
        console.log('✅ Using custody address:', context.user.custody);
        setWalletAddress(context.user.custody);
      } else {
        throw new Error('No wallet address available');
      }
      
    } catch (err: any) {
      console.error('❌ Wallet connection error:', err);
      
      // Don't set error for user rejection
      if (err.code === 4001 || err.message?.includes('rejected')) {
        console.log('User rejected wallet connection');
        return;
      }
      
      setError('Unable to connect wallet. Please try again.');
    }
  };

  return { 
    user, 
    walletAddress, 
    isLoading, 
    error, 
    isMobile,
    requestWallet 
  };
}

// Extend window for ethereum
declare global {
  interface Window {
    ethereum?: any;
  }
}
