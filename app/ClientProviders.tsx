'use client';

import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { monadTestnet } from './chains';
import { injected } from 'wagmi/connectors';

function ErrorBoundary({ children }: { children: React.ReactNode }) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const errorHandler = (error: Error, errorInfo: any) => {
      console.error('ErrorBoundary caught:', error, errorInfo);
      setHasError(true);
    };
    window.addEventListener('error', errorHandler as any);
    return () => window.removeEventListener('error', errorHandler as any);
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
  chains: [monadTestnet],
  connectors: [injected()],
  transports: {
    [monadTestnet.id]: http('https://testnet-rpc.monad.xyz'),
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
