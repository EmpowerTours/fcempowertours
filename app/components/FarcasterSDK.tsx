'use client';

import { useEffect } from 'react';
import sdk from '@farcaster/frame-sdk';

export default function FarcasterSDK() {
  useEffect(() => {
    const load = async () => {
      const context = await sdk.context;
      sdk.actions.ready();
      console.log('✅ Farcaster SDK ready');
    };
    
    load();
  }, []);

  return null;
}
