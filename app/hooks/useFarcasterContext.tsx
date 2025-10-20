'use client';

import { useEffect, useState } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';

interface FarcasterUser {
  fid: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
  custody?: string; // May not be in SDK types
  verifiedAddresses?: string[];
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
        
        const userAgent = navigator.userAgent.toLowerCase();
        const mobile = /mobile|android|iphone|ipad|ipod/.test(userAgent);
        setIsMobile(mobile);
        console.log('📱 Is mobile:', mobile);
        
        const context = await sdk.context;
        
        if (context?.user) {
          // Type assertion to handle custody address (may not be in SDK types)
          const contextUser = context.user as any;
          
          const farcasterUser: FarcasterUser = {
            fid: contextUser.fid,
            username: contextUser.username,
            displayName: contextUser.displayName,
            pfpUrl: contextUser.pfpUrl,
            custody: contextUser.custody, // Safe access with type assertion
            verifiedAddresses: contextUser.verifiedAddresses || [],
          };
          
          console.log('✅ Farcaster user loaded:', {
            username: farcasterUser.username,
            fid: farcasterUser.fid,
            custody: farcasterUser.custody,
            verified: farcasterUser.verifiedAddresses?.length || 0,
          });
          
          setUser(farcasterUser);
          
          // Auto-set wallet on mobile
          if (mobile) {
            if (contextUser.custody) {
              console.log('📱 Mobile: Using custody address:', contextUser.custody);
              setWalletAddress(contextUser.custody);
            } else if (contextUser.verifiedAddresses?.[0]) {
              console.log('📱 Mobile: Using verified address:', contextUser.verifiedAddresses[0]);
              setWalletAddress(contextUser.verifiedAddresses[0]);
            }
          } else {
            if (contextUser.verifiedAddresses?.[0]) {
              console.log('💻 Desktop: Using verified address:', contextUser.verifiedAddresses[0]);
              setWalletAddress(contextUser.verifiedAddresses[0]);
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
        console.log('📱 Mobile detected: Using Farcaster custody address');
        
        const context = await sdk.context;
        const contextUser = context.user as any;
        
        if (contextUser.custody) {
          console.log('✅ Using custody address:', contextUser.custody);
          setWalletAddress(contextUser.custody);
          return;
        }
        
        if (contextUser.verifiedAddresses?.[0]) {
          console.log('✅ Using verified address:', contextUser.verifiedAddresses[0]);
          setWalletAddress(contextUser.verifiedAddresses[0]);
          return;
        }
        
        throw new Error('No wallet address available. Please verify an address in Warpcast settings.');
      }
      
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
      
      console.log('⚠️ No external wallet, using Farcaster address');
      const context = await sdk.context;
      const contextUser = context.user as any;
      
      if (contextUser.verifiedAddresses?.[0]) {
        console.log('✅ Using verified address:', contextUser.verifiedAddresses[0]);
        setWalletAddress(contextUser.verifiedAddresses[0]);
      } else if (contextUser.custody) {
        console.log('✅ Using custody address:', contextUser.custody);
        setWalletAddress(contextUser.custody);
      } else {
        throw new Error('No wallet address available');
      }
      
    } catch (err: any) {
      console.error('❌ Wallet connection error:', err);
      
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

declare global {
  interface Window {
    ethereum?: any;
  }
}
