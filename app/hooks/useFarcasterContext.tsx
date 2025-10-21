'use client';
import { useEffect, useState } from 'react';

// Extended type to include all possible wallet properties
interface ExtendedUser {
  custody_address?: string;
  wallet?: { address?: string };
  walletAddress?: string;
  verified_addresses?: {
    eth_addresses?: string[];
  };
  fid?: number;
  username?: string;
  pfpUrl?: string;
  [key: string]: any;
}

export function useFarcasterContext() {
  const [context, setContext] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [sdk, setSdk] = useState<any>(null);

  useEffect(() => {
    const loadContext = async () => {
      try {
        const { sdk: farcasterSdk } = await import('@farcaster/miniapp-sdk');
        setSdk(farcasterSdk);
        const ctx = await farcasterSdk.context;
        setContext(ctx);
        setError(null);
        
        // Debug: Log the full context to understand structure
        console.log('🔍 Full Farcaster Context:', ctx);
        console.log('🔍 User object:', ctx?.user);
        console.log('🔍 Client object:', ctx?.client);
        
        // Cast to any to avoid type errors with SDK
        const user = ctx?.user as any;
        
        // Log all possible wallet address locations
        console.log('🔍 Wallet address sources:', {
          'user.custody_address': user?.custody_address,
          'user.wallet.address': user?.wallet?.address,
          'user.walletAddress': user?.walletAddress,
          'user.verified_addresses': user?.verified_addresses,
          'wallet.address': ctx?.wallet?.address,
          'address': ctx?.address,
        });
      } catch (err) {
        console.error('Failed to load Farcaster context:', err);
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };
    loadContext();
  }, []);

  const requestWallet = async () => {
    if (!sdk) {
      console.error('SDK not loaded');
      return null;
    }
    try {
      console.log('🔑 Requesting wallet access...');
      const result = await sdk.actions.addFrame();
      console.log('✅ Wallet request result:', result);
      return result;
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

  // FIXED: Try all possible wallet address locations in Farcaster context
  const getWalletAddress = (): string | null => {
    if (!context?.user) return null;

    // Cast to extended type to access all properties
    const user = context.user as ExtendedUser;

    // Priority order for finding wallet address:
    // 1. Custody address (most common for Farcaster)
    if (user.custody_address) {
      console.log('✅ Found custody address:', user.custody_address);
      return user.custody_address;
    }

    // 2. Verified addresses (ETH addresses linked to account)
    if (user.verified_addresses?.eth_addresses?.[0]) {
      console.log('✅ Found verified ETH address:', user.verified_addresses.eth_addresses[0]);
      return user.verified_addresses.eth_addresses[0];
    }

    // 3. Wallet object
    if (user.wallet?.address) {
      console.log('✅ Found wallet.address:', user.wallet.address);
      return user.wallet.address;
    }

    // 4. Direct walletAddress property
    if (user.walletAddress) {
      console.log('✅ Found walletAddress:', user.walletAddress);
      return user.walletAddress;
    }

    // 5. Top-level wallet
    const topLevelWallet = (context as any).wallet?.address;
    if (topLevelWallet) {
      console.log('✅ Found top-level wallet:', topLevelWallet);
      return topLevelWallet;
    }

    // 6. Direct address property
    const directAddress = (context as any).address;
    if (directAddress) {
      console.log('✅ Found direct address:', directAddress);
      return directAddress;
    }

    console.warn('⚠️ No wallet address found in any known location');
    return null;
  };

  const walletAddress = getWalletAddress();

  // Detect if running in mobile Farcaster app
  const isMobile = !!(context?.client?.clientFid);

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
