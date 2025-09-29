'use client';

import { FrameProvider } from '@/components/farcaster-provider';
import { WalletProvider } from '@/components/wallet-provider';
import { State } from 'wagmi';

export function Providers({ children, initialState }: { children: React.ReactNode; initialState?: State }) {
  return (
    <WalletProvider initialState={initialState}>
      <FrameProvider>{children}</FrameProvider>
    </WalletProvider>
  );
}
