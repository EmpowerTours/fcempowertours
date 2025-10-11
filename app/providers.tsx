'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
import { WagmiProvider } from 'wagmi';
import { getConfig } from './music/config';

type Props = {
  children: ReactNode;
  initialState?: Parameters<typeof WagmiProvider>[0]['initialState'];
};

export function Providers({ children, initialState }: Props) {
  const [queryClient] = useState(() => new QueryClient());
  const [config] = useState(() => getConfig());

  return (
    <WagmiProvider config={config} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
