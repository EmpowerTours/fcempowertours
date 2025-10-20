'use client';
import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PrivyProvider } from '@privy-io/react-auth';
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

  // Detect if we're in a Farcaster frame or on mobile
  const [isInFarcasterContext, setIsInFarcasterContext] = useState(false);
  
  useEffect(() => {
    const inFrame = window.parent !== window;
    const isMobile = /mobile|android|iphone|ipad|warpcast|farcaster/i.test(navigator.userAgent);
    setIsInFarcasterContext(inFrame || isMobile);
  }, []);

  // Configure Privy based on context
  const privyConfig = {
    loginMethods: isInFarcasterContext 
      ? ['farcaster' as const] 
      : ['wallet' as const, 'email' as const], // Allow wallet and email on desktop
    embeddedWallets: {
      ethereum: {
        createOnLogin: 'users-without-wallets' as const,
      },
    },
    supportedChains: [monadTestnet],
    appearance: {
      theme: 'light' as const,
      accentColor: '#6763F5',
    },
    // Optional: Add wallet connectors for desktop
    walletConnectModalOptions: {
      chains: [monadTestnet],
    },
  };

  // Skip Privy if no app ID is configured (for development)
  const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  
  if (!privyAppId || privyAppId === '') {
    console.warn('⚠️ Privy App ID not configured - authentication features disabled');
    // Return providers without PrivyProvider
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

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          <PrivyProvider
            appId={privyAppId}
            config={privyConfig}
          >
            {children}
          </PrivyProvider>
        </WagmiProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
