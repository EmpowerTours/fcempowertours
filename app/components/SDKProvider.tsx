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
        let isReady = false;
        
        // Wait for SDK to be fully initialized
        while (attempts < 10 && !isReady) {
          if (farcasterSdk && typeof farcasterSdk.actions !== 'undefined') {
            console.log('✅ Farcaster SDK loaded');
            
            // CRITICAL: Tell Farcaster the app is ready!
            try {
              await farcasterSdk.actions.ready();
              console.log('✅ Called sdk.actions.ready() - splash screen should hide');
              isReady = true;
              setSdkReady(true);
            } catch (readyError) {
              console.warn('⚠️ sdk.actions.ready() failed:', readyError);
              console.warn('This is normal if not running in a Farcaster frame');
              // Still set ready to not block the app
              isReady = true;
              setSdkReady(true);
            }
            break;
          }
          
          await new Promise(resolve => setTimeout(resolve, 500));
          attempts++;
        }
        
        if (!isReady && attempts >= 10) {
          console.error('❌ Farcaster SDK failed to load after 5 seconds');
          console.warn('⚠️ Setting ready anyway to not block the app');
          // Set ready anyway to not block the app
          setSdkReady(true);
        }
      } catch (error) {
        console.error('❌ Failed to load Farcaster SDK:', error);
        console.warn('⚠️ This is normal when not running in Farcaster');
        // Set ready anyway to not block the app
        setSdkReady(true);
      }
    };

    loadSDK();
  }, []);

  if (!sdkReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50">
        <div className="text-center p-8">
          <div className="animate-spin text-4xl mb-4">⏳</div>
          <p className="text-gray-600 font-medium">Initializing EmpowerTours...</p>
          <p className="text-gray-500 text-sm mt-2">Connecting to Farcaster</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
