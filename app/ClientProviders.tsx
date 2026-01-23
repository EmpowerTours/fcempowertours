'use client';

import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { monadMainnet } from './chains';
import { injected } from 'wagmi/connectors';

function ErrorBoundary({ children }: { children: React.ReactNode }) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const errorHandler = (event: ErrorEvent) => {
      // Ignore Farcaster context errors in development (expected outside Warpcast)
      if (event.message?.includes('Farcaster') || event.message?.includes('context')) {
        console.warn('Farcaster context not available (expected outside Warpcast)');
        return;
      }
      console.error('ErrorBoundary caught:', event.message);
      setHasError(true);
    };
    window.addEventListener('error', errorHandler);
    return () => window.removeEventListener('error', errorHandler);
  }, []);

  if (hasError) {
    return <div>Something went wrong. Please refresh.</div>;
  }
  return <>{children}</>;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: (failureCount, error: any) => {
        if (error?.status === 404) {
          return false;
        }
        return failureCount < 3;
      },
    },
  },
});

const wagmiConfig = createConfig({
  chains: [monadMainnet],
  connectors: [injected()],
  transports: {
    [monadMainnet.id]: http('https://rpc.monad.xyz'),
  },
});

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          {/* 🔥 REMOVED: PrivyProvider - use Farcaster SDK only */}
          {children}
        </WagmiProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
