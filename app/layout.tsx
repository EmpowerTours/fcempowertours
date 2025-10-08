import React from 'react';
import { Metadata } from 'next';
import ClientLayout from './ClientLayout';
import './globals.css';

export const runtime = 'nodejs';

export async function generateMetadata(): Promise<Metadata> {
  const appUrl = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';
  const miniAppEmbed = {
    version: '1',
    imageUrl: `${appUrl}/images/og-image.png`,
    button: {
      title: 'Launch EmpowerTours',
      action: {
        type: 'launch_miniapp',
        name: 'EmpowerTours MiniApp',
        url: appUrl,
        splashImageUrl: `${appUrl}/images/splash.png`,
        splashBackgroundColor: '#353B48',
      },
    },
  };
  return {
    metadataBase: new URL('https://fcempowertours-production-6551.up.railway.app'),
    title: 'EmpowerTours MiniApp',
    description: 'Explore NFTs and travel with EmpowerTours on Farcaster',
    openGraph: {
      title: 'EmpowerTours MiniApp',
      description: 'Explore NFTs and travel with EmpowerTours on Farcaster',
      images: [`${appUrl}/images/og-image.png`],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: 'EmpowerTours MiniApp',
      description: 'Explore NFTs and travel with EmpowerTours on Farcaster',
      images: [`${appUrl}/images/og-image.png`],
    },
    other: {
      'fc:miniapp': JSON.stringify(miniAppEmbed),
      'fc:frame': JSON.stringify({
        ...miniAppEmbed,
        button: {
          ...miniAppEmbed.button,
          action: {
            ...miniAppEmbed.button.action,
            type: 'launch_frame',
          },
        },
      }),
    },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
