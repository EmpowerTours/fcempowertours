'use client';
import { useEffect, useState } from 'react';

export default function DebugMobile() {
  const [info, setInfo] = useState<any>(null);

  useEffect(() => {
    const loadInfo = async () => {
      try {
        const { sdk } = await import('@farcaster/miniapp-sdk');
        const context = await sdk.context;
        setInfo(context);
      } catch (error) {
        console.error('Failed to load debug info:', error);
      }
    };
    loadInfo();
  }, []);

  if (!info) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-black text-white text-xs p-2 z-50">
      <pre>{JSON.stringify(info, null, 2)}</pre>
    </div>
  );
}
