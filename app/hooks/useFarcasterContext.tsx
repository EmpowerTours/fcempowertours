'use client';

import { useEffect, useState } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';

interface FarcasterUser {
  fid: number;
  username: string;
  displayName: string;
  pfpUrl: string;
  verifications: string[];
}

interface FarcasterContext {
  user: FarcasterUser | null;
  isLoading: boolean;
  error: string | null;
}

export function useFarcasterContext(): FarcasterContext {
  const [user, setUser] = useState<FarcasterUser | null>(null);
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
            verifications: context.user.verifications || [],
          };
          
          console.log('✅ Farcaster user loaded:', farcasterUser);
          setUser(farcasterUser);
        } else {
          console.warn('⚠️ No user in context');
          setError('Not running in Farcaster client');
        }
      } catch (err) {
        console.error('❌ Failed to load Farcaster context:', err);
        setError('Failed to load user context');
      } finally {
        setIsLoading(false);
      }
    };

    loadContext();
  }, []);

  return { user, isLoading, error };
}
