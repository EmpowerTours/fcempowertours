'use client';

import React from 'react';
import '@rainbow-me/rainbowkit/styles.css';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { monadMainnet } from '@/app/chains';
import { mainnet } from 'wagmi/chains';
import { passkeyRainbowWallet } from '@/lib/passkey/connector';

const config = getDefaultConfig({
  appName: 'EmpowerTours',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'empowertours-standalone',
  // Allow both Monad and Ethereum mainnet for message signing (no chain switch required)
  chains: [monadMainnet, mainnet],
  // The passkey wallet, offered alongside RainbowKit's defaults. `getDefaultConfig` owns its
  // connector list and rejects a bare connector, so it goes in as a wallet group — which also
  // puts it in the connect modal, where somebody would look for it.
  //
  // Appended, never replacing: somebody arriving with MetaMask must still be able to use it.
  // Browser-only by design — inside Farcaster that host's own wallet is used and this group is
  // never reached.
  wallets: [{ groupName: 'EmpowerTours', wallets: [passkeyRainbowWallet] }],
  ssr: true,
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: (failureCount, error: any) => {
        if (error?.status === 404) return false;
        return failureCount < 3;
      },
    },
  },
});

export default function StandaloneProviders({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: '#836EF9',
            accentColorForeground: 'white',
            borderRadius: 'medium',
            overlayBlur: 'small',
          })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
