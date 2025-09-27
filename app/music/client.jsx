"use client";
import React, { useState, useEffect, Suspense } from "react";
import { MusicProvider } from './MusicContext';
import { AudioProvider } from './AudioContext';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { getConfig } from './config';  // Static import here too

// Dynamic imports for client-only components to avoid hydration mismatches
const MusicPageComponent = dynamic(() => import('./MusicPage'), { ssr: false });

// Hydration wrapper
function Hydrated({ children }) {
  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => {
    setIsHydrated(true);
  }, []);
  return isHydrated ? children : null;
}

export default function MusicClientWrapper({ initialState }) {
  const [config] = useState(getConfig);  // Simplified: no require
  const [queryClient] = useState(() => new QueryClient());
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <WagmiProvider config={config} initialState={initialState}>
        <QueryClientProvider client={queryClient}>
          <AudioProvider>
            <MusicProvider>
              <Hydrated>
                <MusicPageComponent />
              </Hydrated>
            </MusicProvider>
          </AudioProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </Suspense>
  );
}
