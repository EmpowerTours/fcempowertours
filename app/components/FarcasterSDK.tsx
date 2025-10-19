'use client';

import { useEffect } from 'react';

export default function FarcasterSDK() {
  useEffect(() => {
    let sdkReady = false;
    
    const initializeSDK = async () => {
      try {
        console.log('🔄 [FarcasterSDK] Starting initialization...');
        
        // Dynamically import to avoid SSR issues
        const { sdk } = await import('@farcaster/miniapp-sdk');
        console.log('✅ [FarcasterSDK] SDK imported successfully');
        
        // Check if we're in Farcaster client
        if (typeof window !== 'undefined') {
          console.log('✅ [FarcasterSDK] Window available, loading context...');
          
          // Try to get context with timeout
          const contextPromise = sdk.context;
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Context timeout')), 2000)
          );
          
          try {
            const context = await Promise.race([contextPromise, timeoutPromise]);
            console.log('✅ [FarcasterSDK] Context loaded:', {
              hasUser: !!context.user,
              hasClient: !!context.client,
            });
          } catch (contextError) {
            console.warn('⚠️ [FarcasterSDK] Context load failed/timeout:', contextError);
            // Continue anyway - we'll still call ready()
          }
          
          // Call ready() - this is the critical part
          if (!sdkReady) {
            console.log('🚀 [FarcasterSDK] Calling sdk.actions.ready()...');
            await sdk.actions.ready();
            sdkReady = true;
            console.log('✅ [FarcasterSDK] ready() called successfully - splash dismissed');
          }
        }
      } catch (error) {
        console.error('❌ [FarcasterSDK] Initialization error:', error);
        
        // Emergency fallback - still try to call ready()
        try {
          const { sdk } = await import('@farcaster/miniapp-sdk');
          if (!sdkReady) {
            console.log('🔄 [FarcasterSDK] Emergency ready() call from error handler...');
            await sdk.actions.ready();
            sdkReady = true;
            console.log('✅ [FarcasterSDK] Emergency ready() succeeded');
          }
        } catch (fallbackError) {
          console.error('❌ [FarcasterSDK] Emergency ready() failed:', fallbackError);
        }
      }
    };
    
    // Start initialization immediately
    initializeSDK();
    
    // Aggressive fallback: Force ready() after 2 seconds no matter what
    const emergencyTimeout = setTimeout(async () => {
      if (!sdkReady) {
        console.log('⏰ [FarcasterSDK] Emergency timeout - forcing ready()...');
        try {
          const { sdk } = await import('@farcaster/miniapp-sdk');
          await sdk.actions.ready();
          sdkReady = true;
          console.log('✅ [FarcasterSDK] Emergency timeout ready() succeeded');
        } catch (e) {
          console.error('❌ [FarcasterSDK] Emergency timeout ready() failed:', e);
        }
      }
    }, 2000);
    
    return () => {
      clearTimeout(emergencyTimeout);
    };
  }, []);

  return null;
}
