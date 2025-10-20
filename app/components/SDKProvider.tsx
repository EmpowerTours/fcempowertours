'use client';

import { useEffect, useState } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';

export default function SDKProvider({ children }: { children: React.ReactNode }) {
  const [sdkReady, setSdkReady] = useState(false);

  useEffect(() => {
    const checkSDK = async () => {
      let attempts = 0;
      while (attempts < 10) {
        if (sdk && typeof sdk.actions !== 'undefined') {
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
    };
    
    checkSDK();
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
