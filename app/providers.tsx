'use client';
import React, { useEffect, useState } from 'react';
import { WagmiProvider, type Config } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { defineChain } from '@reown/appkit/networks';
import { createAppKit } from '@reown/appkit/react'; // Updated import
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'; // New adapter
import { cookieStorage, createStorage } from '@wagmi/core'; // For SSR/cookies
import { sdk } from '@farcaster/miniapp-sdk';
const queryClient = new QueryClient();
export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [config, setConfig] = useState<Config | null>(null);
  useEffect(() => {
    async function initConfig() {
      const { farcasterMiniApp } = await import('@farcaster/miniapp-wagmi-connector');
      const projectId = process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || 'YOUR_PROJECT_ID';
      const monadTestnet = defineChain({
        id: 10143,
        caipNetworkId: 'eip155:10143',
        chainNamespace: 'eip155',
        name: "Monad",
        nativeCurrency: { name: 'MONAD', symbol: 'MONAD', decimals: 18 },
        rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_MONAD_RPC || 'https://testnet-rpc.monad.xyz'] } },
        blockExplorers: { default: { name: 'Monad Explorer', url: 'https://explorer.monad.xyz' } },
      });
      // Custom connectors array
      const connectors = [farcasterMiniApp()];
      // Wagmi Adapter with custom config
      const wagmiAdapter = new WagmiAdapter({
        storage: createStorage({ storage: cookieStorage }),
        ssr: true,
        projectId,
        networks: [monadTestnet],
        connectors,
      });
      const wagmiConfig = wagmiAdapter.wagmiConfig;
      // Metadata (adjusted from your code)
      const metadata = {
        name: 'EmpowerTours',
        description: 'Travel Itinerary Marketplace',
        url: process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app',
        icons: [],
      };
      // Create AppKit modal
      createAppKit({
        adapters: [wagmiAdapter],
        projectId,
        networks: [monadTestnet],
        defaultNetwork: monadTestnet,
        metadata,
        features: {
          analytics: true, // Optional, enable if desired
        },
      });
      setConfig(wagmiConfig);
      setMounted(true);
    }
    initConfig();
  }, []);
  useEffect(() => {
    if (mounted) {
      sdk.actions.ready().catch(console.error);
    }
  }, [mounted]);
  if (!mounted || !config) return null;
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
