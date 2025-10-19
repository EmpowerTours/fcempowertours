'use client';

import { useEffect, useState } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';

interface FarcasterUser {
  fid: number;
  username: string;
  displayName: string;
  pfpUrl: string;
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
    const loadContext = async () => {
      try {
        console.log('🔄 Loading Farcaster context...');
        const context = await sdk.context;
        
        if (context?.user) {
          const farcasterUser: FarcasterUser = {
            fid: context.user.fid,
            username: context.user.username || 'unknown',
            displayName: context.user.displayName || context.user.username || 'User',
            pfpUrl: context.user.pfpUrl || '',
          };
          
          console.log('✅ Farcaster user loaded:', farcasterUser);
          setUser(farcasterUser);
          
          // Tell Farcaster the app is ready
          sdk.actions.ready();
          console.log('✅ Called sdk.actions.ready()');
        } else {
          console.warn('⚠️ No user in context');
          setError('Not running in Farcaster client');
          
          // Still call ready even if no user
          sdk.actions.ready();
        }
      } catch (err) {
        console.error('❌ Failed to load Farcaster context:', err);
        setError('Failed to load user context');
        
        // Call ready even on error to dismiss splash
        try {
          sdk.actions.ready();
        } catch (readyErr) {
          console.error('❌ Failed to call ready():', readyErr);
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadContext();
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
        setError('Wallet provider not available');
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
