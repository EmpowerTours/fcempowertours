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
  const [debugInfo, setDebugInfo] = useState<string>('');

  // Load Farcaster SDK context
  useEffect(() => {
    const loadContext = async () => {
      try {
        console.log('🔄 Attempting to load Farcaster SDK...');
        const { sdk: farcasterSdk } = await import('@farcaster/miniapp-sdk');
        setSdk(farcasterSdk);
        console.log('✅ SDK module imported');

        const ctx: ExtendedFarcasterContext = await farcasterSdk.context;
        console.log('📦 Full context object:', ctx);
        console.log('👤 User object:', ctx?.user);
        console.log('🔑 custody_address:', ctx?.user?.custody_address);
        console.log('🔑 All user keys:', Object.keys(ctx?.user || {}));

        // Log all properties on user object
        if (ctx?.user) {
          console.log('📋 User object properties:');
          for (const [key, value] of Object.entries(ctx.user)) {
            console.log(`  ${key}:`, value);
          }
        }

        setContext(ctx);
        setError(null);

        // Set debug info for UI
        setDebugInfo(`User: ${ctx?.user?.username || 'N/A'}\nFID: ${ctx?.user?.fid || 'N/A'}\nCustody: ${ctx?.user?.custody_address || 'NOT FOUND'}`);

        // If we have a custody address, wallet is effectively "connected"
        if (ctx?.user?.custody_address) {
          console.log('✅ Custody address found:', ctx.user.custody_address);
          setWalletConnected(true);
        } else {
          console.warn('⚠️ No custody_address in user object');
        }
        
        // Signal to Farcaster that app is ready
        try {
          await farcasterSdk.actions.ready();
          console.log('✅ App ready signal sent to Farcaster');
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
    console.log('🔑 requestWallet() called');
    console.log('📦 SDK state:', sdk);
    console.log('📦 SDK actions:', sdk?.actions);

    if (!sdk) {
      console.warn('⚠️ SDK not loaded yet');
      alert('SDK not loaded. Try again in a moment.');
      return null;
    }

    try {
      console.log('🔑 Checking for openWallet method...');
      
      if (typeof sdk.actions?.openWallet === 'function') {
        console.log('🔑 Calling sdk.actions.openWallet()...');
        const result = await sdk.actions.openWallet();
        console.log('✅ openWallet returned:', result);
      } else if (typeof sdk.actions?.requestAddressFromUser === 'function') {
        console.log('🔑 Calling sdk.actions.requestAddressFromUser()...');
        const result = await sdk.actions.requestAddressFromUser();
        console.log('✅ requestAddressFromUser returned:', result);
      } else {
        console.warn('⚠️ No wallet connection method found on SDK');
        console.log('📋 Available SDK actions:', Object.keys(sdk.actions || {}));
      }
      
      // Refresh context to get updated wallet info
      console.log('🔄 Refreshing context...');
      const updatedContext = await sdk.context;
      console.log('📦 Updated context:', updatedContext);
      
      setContext(updatedContext);
      
      if (updatedContext?.user?.custody_address) {
        setWalletConnected(true);
        console.log('✅ Wallet connected:', updatedContext.user.custody_address);
        alert('✅ Wallet connected: ' + updatedContext.user.custody_address);
      } else {
        console.warn('⚠️ Still no custody address after requestWallet');
        alert('⚠️ Custody address not found. Farcaster may not be properly initialized.');
      }
      
      return updatedContext?.user;
    } catch (error) {
      console.error('❌ Failed to request wallet:', error);
      alert('❌ Wallet request failed: ' + String(error));
      
      // Even if openWallet fails, we should still have custody address
      if (context?.user?.custody_address) {
        setWalletConnected(true);
      }
      return context?.user;
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
    // Priority 1: custody_address (with underscore)
    if (context?.user?.custody_address) {
      return context.user.custody_address;
    }

    // Priority 2: custodyAddress (camelCase)
    if (context?.user?.custodyAddress) {
      return context.user.custodyAddress;
    }

    // Priority 3: Check for wallet in user object
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
    debugInfo, // For debugging
  };
}
