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
        console.log('👤 User:', ctx?.user);
        console.log('🔑 Custody Address:', ctx?.user?.custody_address);
        console.log('📱 Platform:', ctx?.client?.platformType);
        
        // If we have a custody address, wallet is effectively "connected"
        if (ctx?.user?.custody_address) {
          console.log('✅ Wallet available via custody address');
          setWalletConnected(true);
        }
        
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
      console.log('🔑 Requesting wallet action...');
      
      // Try to trigger wallet connection UI
      if (sdk.actions?.openWallet) {
        await sdk.actions.openWallet();
        console.log('✅ Opened wallet UI');
      }
      
      // Refresh context to get updated wallet info
      const updatedContext = await sdk.context;
      setContext(updatedContext);
      
      if (updatedContext?.user?.custody_address) {
        setWalletConnected(true);
        console.log('✅ Wallet connected:', updatedContext.user.custody_address);
      }
      
      return updatedContext?.user;
    } catch (error) {
      console.error('❌ Failed to request wallet:', error);
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
      console.log('✅ Using custody_address:', context.user.custody_address);
      return context.user.custody_address;
    }

    // Priority 2: custodyAddress (camelCase, some SDKs use this)
    if (context?.user?.custodyAddress) {
      console.log('✅ Using custodyAddress:', context.user.custodyAddress);
      return context.user.custodyAddress;
    }

    // Priority 3: Check for wallet in user object
    if ((context?.user as any)?.wallet?.address) {
      console.log('✅ Using wallet.address');
      return (context?.user as any).wallet.address;
    }

    console.warn('⚠️ No wallet address found in context:', context?.user);
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
