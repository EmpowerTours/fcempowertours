'use client';
import { useEffect, useState } from 'react';

export default function SDKProvider({ children }: { children: React.ReactNode }) {
  const [sdkReady, setSdkReady] = useState(false);
  const [sdk, setSdk] = useState<any>(null);

  useEffect(() => {
    const loadSDK = async () => {
      try {
        // Dynamic import - only runs on client
        const { sdk: farcasterSdk } = await import('@farcaster/miniapp-sdk');
        setSdk(farcasterSdk);
        
        let attempts = 0;
        while (attempts < 10) {
          if (farcasterSdk && typeof farcasterSdk.actions !== 'undefined') {
            setSdkReady(true);
            console.log('✅ Farcaster SDK ready');
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 500));
          attempts++;
        }
        
        if (!sdkReady) {
          console.error('❌ Farcaster SDK failed to load after 5 seconds');
        }
      } catch (error) {
        console.error('❌ Failed to load Farcaster SDK:', error);
      }
    };

    loadSDK();
  }, []);

  if (!sdkReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50">
        <div className="text-center p-8">
          <div className="animate-spin text-4xl mb-4">⏳</div>
          <p className="text-gray-600">Loading Farcaster...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
