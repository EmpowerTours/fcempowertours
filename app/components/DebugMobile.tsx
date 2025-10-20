// app/components/DebugMobile.tsx
'use client';

import { useState, useEffect } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';

export default function DebugMobile() {
  const [debug, setDebug] = useState<any>({});

  useEffect(() => {
    const gatherDebug = async () => {
      try {
        const context = await sdk.context;
        setDebug({
          hasSDK: !!sdk,
          hasContext: !!context,
          hasUser: !!context?.user,
          userFid: context?.user?.fid,
          custody: context?.user?.custody,
          userAgent: navigator.userAgent,
          isMobile: /mobile/i.test(navigator.userAgent),
          inIframe: window.parent !== window,
        });
      } catch (err) {
        setDebug({ error: err.message });
      }
    };
    
    gatherDebug();
  }, []);

  return (
    <div className="fixed bottom-20 right-4 bg-black text-white p-4 rounded-lg text-xs max-w-xs z-50">
      <pre>{JSON.stringify(debug, null, 2)}</pre>
    </div>
  );
}
