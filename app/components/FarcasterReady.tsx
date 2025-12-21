'use client';
import { useEffect, useState } from 'react';

export default function FarcasterReady({ children }: { children?: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const loadSDK = async () => {
      try {
        const { sdk } = await import('@farcaster/miniapp-sdk');
        if (sdk && typeof sdk.actions !== 'undefined') {
          setReady(true);
        }
      } catch (error) {
        console.error('Failed to load Farcaster SDK:', error);
        // Set ready anyway to not block the app
        setReady(true);
      }
    };
    loadSDK();
  }, []);

  if (!ready) {
    return <div>Loading...</div>;
  }

  // If no children, return null
  if (!children) return null;

  return <>{children}</>;
}
