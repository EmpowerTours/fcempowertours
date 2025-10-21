'use client';

import { useEffect, useState } from 'react';

type ExtendedUserContext = {
  custody_address?: string;
  fid?: number;
  username?: string;
  pfp_url?: string;
  [key: string]: any;
};

type ExtendedFarcasterContext = {
  user?: ExtendedUserContext;
  client?: {
    clientFid?: string | number;
    platformType?: string;
    [key: string]: any;
  };
  [key: string]: any;
};

export function useFarcasterContext() {
  const [context, setContext] = useState<ExtendedFarcasterContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [sdk, setSdk] = useState<any>(null);

  // Load Farcaster SDK context (no Privy)
  useEffect(() => {
    const loadContext = async () => {
      try {
        const { sdk: farcasterSdk } = await import('@farcaster/miniapp-sdk');
        setSdk(farcasterSdk);

        const ctx: ExtendedFarcasterContext = await farcasterSdk.context;
        setContext(ctx);
        setError(null);

        console.log('✅ Farcaster SDK loaded');
        console.log('👤 User:', ctx?.user?.username);
        console.log('📱 Platform:', ctx?.client?.platformType);
        
        // Signal to Farcaster that app is ready
        try {
          await farcasterSdk.actions.ready();
          console.log('✅ App ready signal sent');
        } catch (readyError) {
          console.warn('⚠️ Ready signal failed (normal if not in frame):', readyError);
        }
      } catch (err) {
        console.error('❌ Failed to load Farcaster SDK:', err);
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };

    loadContext();
  }, []);

  const requestWallet = async () => {
    if (!sdk) {
      console.warn('⚠️ SDK not loaded yet');
      return null;
    }

    try {
      console.log('🔑 Requesting wallet from Farcaster...');
      // Farcaster SDK handles wallet requests natively
      // No additional wallet connection needed
      return context?.user;
    } catch (error) {
      console.error('❌ Failed to request wallet:', error);
      return null;
    }
  };

  const sendTransaction = async (params: any) => {
    if (!sdk) throw new Error('SDK not loaded');
    return await sdk.actions.sendTransaction(params);
  };

  const switchChain = async (params: { chainId: number }) => {
    if (!sdk) throw new Error('SDK not loaded');
    return await sdk.actions.switchChain(params);
  };

  const getWalletAddress = (): string | null => {
    // Use Farcaster custody address directly
    if (context?.user?.custody_address) {
      console.log('✅ Using Farcaster custody address');
      return context.user.custody_address;
    }

    console.warn('⚠️ No custody address available');
    return null;
  };

  const walletAddress = getWalletAddress();
  const isMobile = context?.client?.platformType === 'mobile';

  return {
    context,
    loading,
    isLoading: loading,
    error,
    user: context?.user || null,
    walletAddress,
    isMobile,
    requestWallet,
    sendTransaction,
    switchChain,
    sdk,
  };
}
