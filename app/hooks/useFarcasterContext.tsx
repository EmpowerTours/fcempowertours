'use client';

import { useEffect, useState } from 'react';

type ExtendedUserContext = {
  custody_address?: string;
  custodyAddress?: string;
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

        // 🔥 CRITICAL: Wait for SDK to be ready before accessing context
        console.log('🔄 [3/4] Waiting for SDK to be ready...');
        
        let attempts = 0;
        let sdkReady = false;
        let ctx: ExtendedFarcasterContext | null = null;

        while (attempts < 10 && !sdkReady) {
          try {
            // Try to get context
            ctx = await farcasterSdk.context;
            
            if (ctx && ctx.user) {
              console.log('✅ [4/4] Context loaded!');
              console.log('👤 User:', ctx.user);
              console.log('🔑 Custody Address:', ctx.user.custody_address);
              sdkReady = true;
            } else {
              console.warn(`⏳ Attempt ${attempts + 1}: Context not ready, retrying...`);
              attempts++;
              await new Promise(resolve => setTimeout(resolve, 300));
            }
          } catch (contextErr) {
            console.warn(`⏳ Attempt ${attempts + 1}: Context fetch failed, retrying...`, contextErr);
            attempts++;
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        }

        if (!ctx || !ctx.user) {
          console.error('❌ SDK failed to load context after retries');
          console.log('📦 Final context:', ctx);
          throw new Error('Farcaster context failed to initialize');
        }

        if (!isMounted) return;
        setContext(ctx);
        setError(null);

        // Check for wallet
        if (ctx.user?.custody_address) {
          console.log('✅ Custody address available:', ctx.user.custody_address);
          setWalletConnected(true);
        } else {
          console.warn('⚠️ custody_address not found in user object');
          console.log('📋 User object keys:', Object.keys(ctx.user || {}));
        }

        // Signal to Farcaster that app is ready
        try {
          console.log('📡 Sending ready signal...');
          await farcasterSdk.actions.ready();
          console.log('✅ Ready signal sent');
        } catch (readyError) {
          console.warn('⚠️ Ready signal failed (may not be in Farcaster):', readyError);
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
    console.log('🔑 [requestWallet] Called');
    console.log('🔑 [requestWallet] SDK loaded:', !!sdk);
    console.log('🔑 [requestWallet] Context:', context);

    if (!sdk) {
      console.warn('⚠️ SDK not loaded');
      alert('❌ SDK not ready. Please refresh the page.');
      return null;
    }

    if (!context?.user) {
      console.warn('⚠️ No user context');
      alert('❌ User context not loaded. Please refresh.');
      return null;
    }

    try {
      // Farcaster SDK doesn't have requestWallet in mini apps
      // The custody address is automatically available via context
      // Just confirm it's available
      if (context.user.custody_address) {
        console.log('✅ Wallet already available:', context.user.custody_address);
        setWalletConnected(true);
        alert(`✅ Wallet Connected!\n\n${context.user.custody_address}`);
        return context.user;
      }

      console.warn('⚠️ custody_address still not available');
      
      // Try to refresh context one more time
      console.log('🔄 Attempting to refresh context...');
      const refreshedCtx = await sdk.context;
      
      if (refreshedCtx?.user?.custody_address) {
        console.log('✅ Got custody address on refresh:', refreshedCtx.user.custody_address);
        setContext(refreshedCtx);
        setWalletConnected(true);
        alert(`✅ Wallet Connected!\n\n${refreshedCtx.user.custody_address}`);
        return refreshedCtx.user;
      }

      throw new Error('Custody address not available in Farcaster context');

    } catch (error) {
      console.error('❌ Wallet request failed:', error);
      alert(`❌ Wallet Error: ${String(error)}`);
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
    if (context?.user?.custody_address) {
      return context.user.custody_address;
    }
    if (context?.user?.custodyAddress) {
      return context.user.custodyAddress;
    }
    if ((context?.user as any)?.wallet?.address) {
      return (context?.user as any).wallet.address;
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
  };
}
