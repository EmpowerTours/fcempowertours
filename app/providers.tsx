'use client';
import React, { useEffect, useState } from 'react';
import { WagmiProvider, type Config } from 'wagmi'; // Import Config type
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { defineChain } from 'viem';
import { createWeb3Modal } from '@web3modal/wagmi/react'; // Add this for v5 modal init
import { defaultWagmiConfig } from '@web3modal/wagmi/react/config'; // Correct v5 import
import { sdk } from '@farcaster/miniapp-sdk';
import { useConnect } from 'wagmi'; // Add for auto-connect

const queryClient = new QueryClient();
export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [config, setConfig] = useState<Config | null>(null); // Use Config type instead of any
  const { connect, connectors } = useConnect(); // Get connect function and connectors

  // Call ready() early to hide splash ASAP
  useEffect(() => {
    sdk.actions.ready().catch(console.error);
  }, []); // Runs once on mount

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
      // Init modal here (replaces <Web3Modal /> in v5)
      createWeb3Modal({
        wagmiConfig,
        projectId,
        // Optional: add other options if needed, e.g., themeMode: 'light'
      });
      setMounted(true);
    }
    initConfig();
  }, []);

  // Auto-connect if in mini-app and config is ready
  useEffect(() => {
    if (mounted && config && sdk.isInMiniApp()) {
      const farcasterConnector = connectors.find(c => c.id === 'farcasterMiniApp'); // Assume id from connector
      if (farcasterConnector) {
        connect({ connector: farcasterConnector });
      }
    }
  }, [mounted, config, connect, connectors]);

  if (!mounted || !config) return null;
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
