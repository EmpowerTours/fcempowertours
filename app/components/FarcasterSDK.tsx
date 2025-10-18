'use client';

import { useEffect } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';

export default function FarcasterSDK() {
  useEffect(() => {
    const initializeSDK = async () => {
      try {
        console.log('🔄 Initializing Farcaster SDK...');
        
        // Wait for SDK context
        const context = await sdk.context;
        console.log('✅ Farcaster SDK context loaded:', {
          user: context.user,
          client: context.client,
        });
        
        // CRITICAL: Signal that the app is ready (dismisses splash screen)
        await sdk.actions.ready();
        console.log('✅ Farcaster SDK ready() called - splash screen dismissed');
      } catch (error) {
        console.error('❌ Farcaster SDK initialization error:', error);
        
        // Still call ready() even if there's an error to dismiss splash
        try {
          await sdk.actions.ready();
          console.log('⚠️ Farcaster SDK ready() called from error handler');
        } catch (readyError) {
          console.error('❌ Failed to call ready():', readyError);
        }
      }
    };
    
    initializeSDK();
    
    // Fallback: Force call ready() after 3 seconds if initialization hangs
    const fallbackTimeout = setTimeout(async () => {
      console.log('⏰ Fallback timeout reached - calling ready()');
      try {
        await sdk.actions.ready();
        console.log('⏰ Fallback ready() called successfully');
      } catch (e) {
        console.error('❌ Fallback ready() failed:', e);
      }
    }, 3000);
    
    return () => clearTimeout(fallbackTimeout);
  }, []);

  return null;
}
