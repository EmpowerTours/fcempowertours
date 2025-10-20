'use client';

import { useEffect, useState } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';

export default function FarcasterReady() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    
    const initializeSDK = async () => {
      try {
        // Wait a bit for SDK to fully load on mobile
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Verify SDK is available
        if (typeof sdk === 'undefined' || !sdk.actions) {
          console.warn('⚠️ SDK not available yet, retrying...');
          if (mounted) {
            setTimeout(initializeSDK, 500);
          }
          return;
        }
        
        // Call ready() only after SDK is confirmed available
        sdk.actions.ready();
        console.log('✅ sdk.actions.ready() called successfully');
        setIsReady(true);
      } catch (error) {
        console.error('❌ Failed to call sdk.actions.ready():', error);
        // Retry on mobile
        if (mounted) {
          setTimeout(initializeSDK, 1000);
        }
      }
    };

    initializeSDK();

    return () => {
      mounted = false;
    };
  }, []);

  return null;
}
