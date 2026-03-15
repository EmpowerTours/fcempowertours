import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Monad Block Party | Anonymous On-Chain Threads',
  description: 'Start anonymous threads. Tip the best ones. Most-tipped thread wins the pot. All on-chain on Monad.',
  openGraph: {
    title: 'Monad Block Party',
    description: 'Anonymous on-chain threads. Most-tipped wins the pot.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Monad Block Party',
    description: 'Anonymous on-chain threads. Most-tipped wins the pot.',
  },
};

export default function BlockPartyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
