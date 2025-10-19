'use client';

import { useEffect, useState } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';

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
  requestWallet: () => Promise<void>;
}

export function useFarcasterContext(): FarcasterContext {
  const [user, setUser] = useState<FarcasterUser | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadUser = async () => {
      try {
        console.log('🔄 Loading Farcaster user...');
        
        // CRITICAL: Call ready() IMMEDIATELY
        // Don't wait for context to load
        sdk.actions.ready();
        console.log('✅ Called sdk.actions.ready() immediately');
        
        // Now load context in background
        const context = await sdk.context;
        
        if (context?.user) {
          const farcasterUser: FarcasterUser = {
            fid: context.user.fid,
            username: context.user.username,
            displayName: context.user.displayName,
            pfpUrl: context.user.pfpUrl,
          };
          
          console.log('✅ Farcaster user loaded:', farcasterUser);
          setUser(farcasterUser);
          setError(null);
        } else {
          console.warn('⚠️ No user in context');
          // Don't set error - user might still be there
          // Just continue without user data
        }
        
      } catch (err) {
        console.error('❌ Failed to load Farcaster user:', err);
        // Don't block the app - just log the error
        console.log('App will continue without user context');
      } finally {
        setIsLoading(false);
      }
    };

    loadUser();
  }, []);

  const requestWallet = async () => {
    try {
      console.log('🔑 Requesting wallet address...');
      
      // Check if ethereum provider exists (Warpcast browser provides this)
      if (typeof window !== 'undefined' && window.ethereum) {
        const accounts = await window.ethereum.request({
          method: 'eth_requestAccounts'
        });
        
        if (accounts && accounts[0]) {
          setWalletAddress(accounts[0] as string);
          console.log('✅ Wallet connected:', accounts[0]);
        }
      } else {
        console.warn('⚠️ No ethereum provider found');
      }
    } catch (err) {
      console.error('❌ Failed to get wallet:', err);
      // Don't set error for user rejection
      if ((err as any).code !== 4001) {
        setError('Failed to connect wallet');
      }
    }
  };

  return { user, walletAddress, isLoading, error, requestWallet };
}
