'use client';
import { useEffect, Component, ErrorInfo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { PrivyProvider } from '@privy-io/react-auth';
import { sdk } from '@farcaster/miniapp-sdk';
import { monadTestnet } from './chains';

// Error boundary component
class ErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <div>Something went wrong. Please refresh.</div>;
    }
    return this.props.children;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: (failureCount, error: unknown) => {
        // Safely check for status property
        if (error instanceof Error && 'status' in error && error.status === 404) {
          return false;
        }
        return failureCount < 3;
      },
    },
  },
});

const config = createConfig({
  chains: [monadTestnet],
  transports: {
    [monadTestnet.id]: http(),
  },
});

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof window === 'undefined') {
      console.error('ClientProviders executed on server-side');
      return;
    }
    console.log('ClientProviders executed on client-side');
    try {
      sdk.actions.ready();
      console.log('Farcaster SDK ready called');
    } catch (error) {
      console.error('Farcaster SDK ready error:', error);
    }
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <PrivyProvider
          appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || ''}
          config={{
            supportedChains: [monadTestnet],
            appearance: { theme: 'light' },
          }}
        >
          <WagmiProvider config={config}>{children}</WagmiProvider>
        </PrivyProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
