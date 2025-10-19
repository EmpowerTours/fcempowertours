'use client';

import { useEffect } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';

/**
 * This component calls sdk.actions.ready() IMMEDIATELY
 * to dismiss the splash screen. Must be rendered in layout.
 */
export default function FarcasterReady() {
  useEffect(() => {
    // Call ready() as soon as component mounts
    try {
      sdk.actions.ready();
      console.log('✅ sdk.actions.ready() called immediately');
    } catch (error) {
      console.error('❌ Failed to call sdk.actions.ready():', error);
    }
  }, []);

  // This component renders nothing
  return null;
}
