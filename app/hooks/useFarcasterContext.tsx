'use client';

import { useEffect, useState } from 'react';

// Extended type for Farcaster user context
type ExtendedUserContext = {
  custody_address?: string;
  wallet?: { address?: string };
  walletAddress?: string;
  verified_addresses?: {
    eth_addresses?: string[];
  };
  [key: string]: any; // Allow additional unknown properties safely
};

// Full context type (simplified but safe)
type ExtendedFarcasterContext = {
  user?: ExtendedUserContext;
  wallet?: { address?: string };
  address?: string;
  client?: { clientFid?: string };
  [key: string]: any;
};

export function useFarcasterContext() {
  const [context, setContext] = useState<ExtendedFarcasterContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [sdk, setSdk] = useState<any>(null);

  useEffect(() => {
    const loadContext = async () => {
      try {
        const { sdk: farcasterSdk } = await import('@farcaster/miniapp-sdk');
        setSdk(farcasterSdk);

        const ctx: ExtendedFarcasterContext = await farcasterSdk.context;
        setContext(ctx);
        setError(null);

        // Debug logs
        console.log('🔍 Full Farcaster Context:', ctx);
        console.log('🔍 User object:', ctx?.user);
        console.log('🔍 Client object:', ctx?.client);

        // Log all possible wallet address sources
        console.log('🔍 Wallet address sources:', {
          'user.custody_address': ctx?.user?.custody_address,
          'user.wallet.address': ctx?.user?.wallet?.address,
          'user.walletAddress': ctx?.user?.walletAddress,
          'user.verified_addresses': ctx?.user?.verified_addresses,
          'wallet.address': ctx?.wallet?.address,
          'address': ctx?.address,
        });
      } catch (err) {
        console.error('❌ Failed to load Farcaster context:', err);
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };

    loadContext();
  }, []);

  // ---- SDK Actions ----
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

  // ---- Wallet Address Resolver ----
  const getWalletAddress = () => {
    if (!context?.user) return null;

    // 1. Custody address
    if (context.user.custody_address) {
      console.log('✅ Found custody address:', context.user.custody_address);
      return context.user.custody_address;
    }

    // 2. Verified ETH address
    if (context.user.verified_addresses?.eth_addresses?.[0]) {
      console.log('✅ Found verified ETH address:', context.user.verified_addresses.eth_addresses[0]);
      return context.user.verified_addresses.eth_addresses[0];
    }

    // 3. Wallet object
    if (context.user.wallet?.address) {
      console.log('✅ Found wallet.address:', context.user.wallet.address);
      return context.user.wallet.address;
    }

    // 4. Direct walletAddress
    if (context.user.walletAddress) {
      console.log('✅ Found walletAddress:', context.user.walletAddress);
      return context.user.walletAddress;
    }

    // 5. Top-level wallet
    if (context.wallet?.address) {
      console.log('✅ Found top-level wallet:', context.wallet.address);
      return context.wallet.address;
    }

    // 6. Direct address
    if (context.address) {
      console.log('✅ Found direct address:', context.address);
      return context.address;
    }

    console.warn('⚠️ No wallet address found in any known location');
    return null;
  };

  const walletAddress = getWalletAddress();

  // ---- Device Detection ----
  const isMobile = context?.client?.clientFid ? true : false;

  // ---- Return Values ----
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
