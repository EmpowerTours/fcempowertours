'use client';

import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { PrivyProvider } from '@privy-io/react-auth';
import type { ReactNode } from 'react';
import type { State } from 'wagmi';
import { getConfig } from './music/config';
import { monadTestnet } from './chains';

// Error boundary component (from your ClientProviders)
function ErrorBoundary({ children }: { children: ReactNode }) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const errorHandler = (error: Error, errorInfo: any) => {
      console.error('ErrorBoundary caught:', {
        errorMessage: String(error.message || error),
        errorStack: String(error.stack || 'No stack'),
        errorInfo: JSON.stringify(errorInfo || {}),
      });
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
  initialState?: State; // From Wagmi SSR
};

export function Providers({ children, initialState }: Props) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5, // 5 minutes
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

  const [config] = useState(() => getConfig()); // Client-only creation

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={config} initialState={initialState}>
          <PrivyProvider
            appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || ''}
            config={{
              loginMethods: ['farcaster'],
              embeddedWallets: {
                ethereum: { createOnLogin: 'users-without-wallets' },
              },
              appearance: {
                theme: 'light',
                accentColor: '#6763F5',
              },
            }}
          >
            {children}
          </PrivyProvider>
        </WagmiProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
