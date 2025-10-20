'use client';

import { useEffect, useState } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';

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
        else if (!mobile && typeof window !== 'undefined' && window.ethereum) {
          try {
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
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
        
        // Better error messages
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
      
      // Method 1: Custody address
      if (contextUser?.custody) {
        console.log('✅ Using custody address:', contextUser.custody);
        setWalletAddress(contextUser.custody);
        setError(null);
        return;
      }
      
      // Method 2: Verified addresses
      if (contextUser?.verifiedAddresses?.[0]) {
        console.log('✅ Using verified address:', contextUser.verifiedAddresses[0]);
        setWalletAddress(contextUser.verifiedAddresses[0]);
        setError(null);
        return;
      }
      
      // Method 3: Request from window.ethereum (desktop only)
      if (!isMobile && typeof window !== 'undefined' && window.ethereum) {
        console.log('💻 Requesting from window.ethereum...');
        try {
          const accounts = await window.ethereum.request({
            method: 'eth_requestAccounts'
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
      
      // If we get here, no wallet found
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

  return { 
    user, 
    walletAddress, 
    isLoading, 
    error, 
    isMobile,
    requestWallet 
  };
}
