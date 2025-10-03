'use client';

import React, { useEffect, useState } from 'react';
import { WagmiProvider, defaultWagmiConfig } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { defineChain } from 'viem';
import { Web3Modal } from '@web3modal/wagmi/react';
import { sdk } from '@farcaster/miniapp-sdk';

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [config, setConfig] = useState<any>(null);

  useEffect(() => {
    async function initConfig() {
      const { farcasterMiniApp } = await import('@farcaster/miniapp-wagmi-connector');
      const projectId = process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || 'YOUR_PROJECT_ID';
      const monadTestnet = defineChain({
        id: 10143,
        name: "Monad",
        nativeCurrency: { name: 'MONAD', symbol: 'MONAD', decimals: 18 },
        rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_MONAD_RPC || 'https://testnet-rpc.monad.xyz'] } },
        blockExplorers: { default: { name: 'Monad Explorer', url: 'https://explorer.monad.xyz' } },
      });
      const wagmiConfig = defaultWagmiConfig({
        chains: [monadTestnet],
        projectId,
        metadata: {
          name: 'EmpowerTours',
          description: 'Travel Itinerary Marketplace',
          url: process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app',
          icons: []
        },
        connectors: [farcasterMiniApp()],
      });
      setConfig(wagmiConfig);
      setMounted(true);
    }
    initConfig();
  }, []);

  useEffect(() => {
    if (mounted) {
      sdk.actions.ready().catch(console.error);  // Hide splash here
    }
  }, [mounted]);

  if (!mounted || !config) return null;

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
        <Web3Modal wagmiConfig={config} projectId={process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || ''} />
      </QueryClientProvider>
    </WagmiProvider>
  );
}
