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
      } catch (err) {
        console.error('Failed to load Farcaster context:', err);
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };
    loadContext();
  }, []);

  // Helper functions using SDK
  const requestWallet = async () => {
    if (!sdk) {
      console.error('SDK not loaded');
      return null;
    }
    try {
      const result = await sdk.actions.addFrame();
      return result;
    } catch (error) {
      console.error('Failed to request wallet:', error);
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

  return {
    context,
    loading,
    isLoading: loading,  // Alias for loading
    error,
    user: context?.user || null,
    walletAddress: context?.user?.walletAddress || null,
    isMobile: context?.client?.clientFid ? true : false,
    requestWallet,
    sendTransaction,
    switchChain,
  };
}
