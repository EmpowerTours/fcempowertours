'use client';

import { useState, useEffect } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';

export default function DebugMobile() {
  const [debug, setDebug] = useState<any>({});
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    const gatherDebug = async () => {
      try {
        let context: any = null;
        try {
          context = await sdk.context;
        } catch (err) {
          console.error('Failed to get context:', err);
        }
        
        // Cast to any to avoid TypeScript issues
        const user = context?.user as any;
        
        setDebug({
          timestamp: new Date().toISOString(),
          hasSDK: !!sdk,
          sdkMethods: sdk ? Object.keys(sdk) : [],
          hasContext: !!context,
          hasUser: !!user,
          userFid: user?.fid,
          username: user?.username,
          custody: user?.custody ? (user.custody.substring(0, 10) + '...') : 'none',
          userAgent: navigator.userAgent.substring(0, 100) + '...',
          isMobile: /mobile/i.test(navigator.userAgent),
          inIframe: window.parent !== window,
          screenWidth: window.innerWidth,
          screenHeight: window.innerHeight,
        });
      } catch (err: any) {
        setDebug({ error: err.message, timestamp: new Date().toISOString() });
      }
    };
    
    gatherDebug();
    // Re-run every 5 seconds to catch updates
    const interval = setInterval(gatherDebug, 5000);
    
    return () => clearInterval(interval);
  }, []);

  if (!showDebug) {
    return (
      <button
        onClick={() => setShowDebug(true)}
        className="fixed bottom-20 right-4 bg-purple-600 text-white p-2 rounded-full shadow-lg z-50"
      >
        🐛
      </button>
    );
  }

  return (
    <div className="fixed bottom-20 right-4 bg-black text-white p-4 rounded-lg text-xs max-w-xs z-50 max-h-96 overflow-y-auto">
      <button
        onClick={() => setShowDebug(false)}
        className="absolute top-2 right-2 text-white"
      >
        ✕
      </button>
      <pre className="whitespace-pre-wrap break-words">
        {JSON.stringify(debug, null, 2)}
      </pre>
    </div>
  );
}
