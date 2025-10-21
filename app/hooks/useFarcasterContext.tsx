'use client';

import { useEffect, useState } from 'react';

type ExtendedUserContext = {
  custody_address?: string;
  custodyAddress?: string;
  fid?: number;
  username?: string;
  pfpUrl?: string;
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
  const [walletConnected, setWalletConnected] = useState(false);

  // Load Farcaster SDK context
  useEffect(() => {
    let isMounted = true;

    const loadContext = async () => {
      try {
        console.log('🔄 [1/4] Importing Farcaster SDK...');
        const farcasterModule = await import('@farcaster/miniapp-sdk');
        const { sdk: farcasterSdk } = farcasterModule;
        
        if (!farcasterSdk) {
          throw new Error('SDK import returned undefined');
        }

        console.log('✅ [2/4] SDK imported successfully');
        
        if (!isMounted) return;
        setSdk(farcasterSdk);

        console.log('🔄 [3/4] Waiting for SDK to be ready...');
        
        let attempts = 0;
        let sdkReady = false;
        let ctx: ExtendedFarcasterContext | null = null;

        while (attempts < 10 && !sdkReady) {
          try {
            ctx = await farcasterSdk.context;
            
            if (ctx && ctx.user) {
              console.log('✅ [4/4] Context loaded!');
              console.log('👤 Full context:', ctx);
              console.log('👤 Full user object:', ctx.user);
              console.log('📋 All user keys:', Object.keys(ctx.user));
              
              // Log every property
              for (const [key, value] of Object.entries(ctx.user)) {
                console.log(`  ${key}:`, value);
              }
              
              sdkReady = true;
            } else {
              console.warn(`⏳ Attempt ${attempts + 1}: Context not ready`);
              attempts++;
              await new Promise(resolve => setTimeout(resolve, 300));
            }
          } catch (contextErr) {
            console.warn(`⏳ Attempt ${attempts + 1}: Error fetching context`, contextErr);
            attempts++;
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        }

        if (!ctx || !ctx.user) {
          throw new Error('Failed to load Farcaster context');
        }

        if (!isMounted) return;
        setContext(ctx);
        setError(null);

        // Check for wallet - try multiple keys
        if (ctx.user?.custody_address) {
          console.log('✅ Found custody_address:', ctx.user.custody_address);
          setWalletConnected(true);
        } else if (ctx.user?.fid) {
          console.log('✅ Using FID as identifier (no custody_address in mini app):', ctx.user.fid);
          // In mini app context, we use FID as the identifier
          setWalletConnected(true);
        } else {
          console.warn('⚠️ No wallet identifier found');
        }

        // Signal to Farcaster that app is ready
        try {
          await farcasterSdk.actions.ready();
          console.log('✅ Ready signal sent');
        } catch (readyError) {
          console.warn('⚠️ Ready signal failed:', readyError);
        }

      } catch (err) {
        console.error('❌ Failed to initialize Farcaster SDK:', err);
        if (isMounted) {
          setError(err as Error);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadContext();

    return () => {
      isMounted = false;
    };
  }, []);

  const requestWallet = async () => {
    console.log('🔑 requestWallet() called');

    if (!context?.user) {
      console.warn('⚠️ No user context');
      return null;
    }

    try {
      // In Farcaster mini apps, we don't have custody_address
      // Instead, use FID + username as the identifier
      if (context.user.fid && context.user.username) {
        console.log('✅ Wallet ready (using FID):', context.user.fid);
        setWalletConnected(true);
        return context.user;
      }

      throw new Error('No FID available');

    } catch (error) {
      console.error('❌ Wallet request failed:', error);
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

  // 🔥 FIXED: Use FID as wallet identifier in mini apps
  // The custody address isn't available in Farcaster mini app context
  const getWalletAddress = (): string | null => {
    // Try custody_address first (desktop)
    if (context?.user?.custody_address) {
      return context.user.custody_address;
    }

    // In Farcaster mini apps, we generate an identifier from FID
    // This is NOT a real wallet address, but a unique user identifier
    if (context?.user?.fid) {
      // Create a deterministic "address-like" string from FID for compatibility
      const fid = context.user.fid;
      // Format as: 0x + fid padded with zeros (e.g., 0x0000000000bbf7e)
      return `0x${fid.toString().padStart(40, '0')}`;
    }

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
    walletConnected,
    requestWallet,
    sendTransaction,
    switchChain,
    sdk,
    fid: context?.user?.fid,
  };
}
