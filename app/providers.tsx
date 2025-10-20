'use client';
import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig, http } from 'wagmi';
import type { ReactNode } from 'react';
import { monadTestnet } from './chains';
// Create wagmi config
const wagmiConfig = createConfig({
  chains: [monadTestnet],
  transports: {
    [monadTestnet.id]: http(process.env.NEXT_PUBLIC_MONAD_RPC || 'https://testnet-rpc.monad.xyz'),
  },
});
// Error boundary component
function ErrorBoundary({ children }: { children: ReactNode }) {
  const [hasError, setHasError] = useState(false);
  useEffect(() => {
    const errorHandler = (error: Error) => {
      console.error('ErrorBoundary caught:', error);
      setHasError(true);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('error', errorHandler as any);
      return () => window.removeEventListener('error', errorHandler as any);
    }
  }, []);
  if (hasError) {
    return <div>Something went wrong. Please refresh.</div>;
  }
  return <>{children}</>;
}
type Props = {
  children: ReactNode;
};
export function Providers({ children }: Props) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
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
      })
  );
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          {children}
        </WagmiProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
