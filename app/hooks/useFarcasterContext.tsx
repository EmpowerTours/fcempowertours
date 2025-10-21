'use client';
import { useEffect, useState } from 'react';

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
        
        // Log all possible wallet address locations
        console.log('🔍 Wallet address sources:', {
          'user.custody_address': ctx?.user?.custody_address,
          'user.wallet.address': ctx?.user?.wallet?.address,
          'user.walletAddress': ctx?.user?.walletAddress,
          'user.verified_addresses': ctx?.user?.verified_addresses,
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
  const getWalletAddress = () => {
    if (!context?.user) return null;

    // Priority order for finding wallet address:
    // 1. Custody address (most common for Farcaster)
    if (context.user.custody_address) {
      console.log('✅ Found custody address:', context.user.custody_address);
      return context.user.custody_address;
    }

    // 2. Verified addresses (ETH addresses linked to account)
    if (context.user.verified_addresses?.eth_addresses?.[0]) {
      console.log('✅ Found verified ETH address:', context.user.verified_addresses.eth_addresses[0]);
      return context.user.verified_addresses.eth_addresses[0];
    }

    // 3. Wallet object
    if (context.user.wallet?.address) {
      console.log('✅ Found wallet.address:', context.user.wallet.address);
      return context.user.wallet.address;
    }

    // 4. Direct walletAddress property
    if (context.user.walletAddress) {
      console.log('✅ Found walletAddress:', context.user.walletAddress);
      return context.user.walletAddress;
    }

    // 5. Top-level wallet
    if (context.wallet?.address) {
      console.log('✅ Found top-level wallet:', context.wallet.address);
      return context.wallet.address;
    }

    // 6. Direct address property
    if (context.address) {
      console.log('✅ Found direct address:', context.address);
      return context.address;
    }

    console.warn('⚠️ No wallet address found in any known location');
    return null;
  };

  const walletAddress = getWalletAddress();

  // Detect if running in mobile Farcaster app
  const isMobile = context?.client?.clientFid ? true : false;

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
