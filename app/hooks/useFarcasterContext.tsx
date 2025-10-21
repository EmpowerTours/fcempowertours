'use client';
import { useEffect, useState } from 'react';

export function useFarcasterContext() {
  const [context, setContext] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadContext = async () => {
      try {
        const { sdk } = await import('@farcaster/miniapp-sdk');
        const ctx = await sdk.context;
        setContext(ctx);
      } catch (error) {
        console.error('Failed to load Farcaster context:', error);
      } finally {
        setLoading(false);
      }
    };
    loadContext();
  }, []);

  return { context, loading };
}
