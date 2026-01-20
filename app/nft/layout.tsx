import type { Metadata } from 'next';

const APP_URL = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';

export const metadata: Metadata = {
  title: 'Music NFTs - EmpowerTours',
  description: 'Mint and license music NFTs on EmpowerTours. Artists retain ownership with 90/10 revenue split. Built on Monad.',
  openGraph: {
    title: 'EmpowerTours Music NFTs',
    description: 'Mint and license music NFTs. Artists keep 90%, fans get licensed streaming.',
    url: `${APP_URL}/music`,
    siteName: 'EmpowerTours',
    images: [
      {
        url: `${APP_URL}/api/og/music`,
        width: 1200,
        height: 630,
        alt: 'EmpowerTours Music NFTs',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'EmpowerTours Music NFTs',
    description: 'Mint and license music NFTs. Artists keep 90%, fans get licensed streaming.',
    images: [`${APP_URL}/api/og/music`],
  },
  // ✅ CRITICAL: Farcaster Frame metadata for proper previews
  other: {
    'fc:frame': 'vNext',
    'fc:frame:image': `${APP_URL}/api/og/music`,
    'fc:frame:button:1': 'View Music',
    'fc:frame:button:1:action': 'link',
    'fc:frame:button:1:target': `${APP_URL}/music`,
  },
};

export default function MusicLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children;
}
