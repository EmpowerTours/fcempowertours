'use client';

import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { PrivyProvider } from '@privy-io/react-auth';
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
          <PrivyProvider
            appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || 'cmaoduqox005ole0nmj1s4qck'}
            config={{
              // 🔥 KEY FIX: Disable all auto-login behavior
              loginMethods: ['farcaster'],
              embeddedWallets: {
                createOnLogin: 'off', // ✅ Don't auto-create wallets
                requireUserPasswordOnCreate: false,
                noPromptOnSignature: true, // ✅ No signature prompts
              },
              appearance: {
                theme: 'light',
                accentColor: '#6763F5',
                showWalletLoginFirst: false,
                // 🔥 Hide the Privy modal by default
                logo: undefined,
                walletList: [], // Empty wallet list
              },
              // 🔥 Critical: Don't show modals automatically
              mfa: { noPromptOnMfaRequired: true },
              // 🔥 Don't automatically connect
              supportedChains: [monadTestnet],
            }}
          >
            {children}
          </PrivyProvider>
        </WagmiProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
