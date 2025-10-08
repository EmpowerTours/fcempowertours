'use client';
import { useEffect } from 'react';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { PrivyProvider } from '@privy-io/react-auth';
import { sdk } from '@farcaster/miniapp-sdk';
import { monadTestnet } from './chains';

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
    } else {
      console.log('ClientProviders executed on client-side');
      // Signal Farcaster app is ready to dismiss splash screen
      sdk.actions.ready();
    }
  }, []);

  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || ''}
      config={{
        supportedChains: [monadTestnet],
        appearance: { theme: 'light' },
      }}
    >
      <WagmiProvider config={config}>{children}</WagmiProvider>
    </PrivyProvider>
  );
}
