import { farcasterMiniApp as miniAppConnector } from '@farcaster/miniapp-wagmi-connector'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, WagmiProvider, createConfig, type State } from 'wagmi'  // Import State for typing
import { monadTestnet } from 'wagmi/chains'
import { ReactNode } from 'react';  // Import for children typing

export const config = createConfig({
  chains: [monadTestnet],
  transports: {
    [monadTestnet.id]: http(),
  },
  connectors: [miniAppConnector()],
})

const queryClient = new QueryClient()

// Updated to accept initialState prop with typing
export function WalletProvider({
  children,
  initialState,
}: {
  children: ReactNode;
  initialState?: State;  // Optional Wagmi State
}) {
  return (
    <WagmiProvider config={config} initialState={initialState}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  )
}
