import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';
import ClientNav from './components/ClientNav';
import ClientBotFrame from './components/ClientBotFrame';

const APP_URL = 'https://fcempowertours-production-6551.up.railway.app';

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: 'EmpowerTours - DigitalPassport',
  description: 'Mint and share Travel and Music NFTs on EmpowerTours, powered by Monad and Farcaster.',
  keywords: ['travel', 'music', 'nfts', 'farcaster', 'monad', 'blockchain', 'web3'],
  authors: [{ name: 'EmpowerTours Team' }],
  creator: 'EmpowerTours',
  publisher: 'EmpowerTours',
  applicationName: 'EmpowerTours',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: APP_URL,
    siteName: 'EmpowerTours',
    title: 'EmpowerTours - DigitalPassport',
    description: 'Mint and share Travel and Music NFTs on EmpowerTours.',
    images: [
      {
        url: `${APP_URL}/images/og-image.png`,
        width: 1200,
        height: 630,
        alt: 'EmpowerTours - Travel and Music NFTs',
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'EmpowerTours - DigitalPassport',
    description: 'Mint and share Travel and Music NFTs on EmpowerTours.',
    creator: '@empowertours',
    images: [`${APP_URL}/images/og-image.png`],
  },
  icons: {
    icon: '/images/icon.png',
    shortcut: '/images/icon.png',
    apple: '/images/icon.png',
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'EmpowerTours',
    statusBarStyle: 'black-translucent',
  },
  other: {
    // Farcaster Frame Properties (from manifest.json)
    'fc:frame': 'vNext',
    'fc:frame:image': `${APP_URL}/images/feed.png`,
    'fc:frame:button:1': 'Open EmpowerTours',
    'fc:frame:button:1:action': 'link',
    'fc:frame:button:1:target': APP_URL,
    
    // Open Graph (extended)
    'og:url': APP_URL,
    'og:type': 'website',
    'og:title': 'EmpowerTours - DigitalPassport',
    'og:description': 'Mint and share Travel and Music NFTs on EmpowerTours.',
    'og:image': `${APP_URL}/images/og-image.png`,
    'og:image:width': '1200',
    'og:image:height': '630',
    'og:image:type': 'image/png',
    'og:image:alt': 'EmpowerTours - Travel and Music NFTs',
    
    // Twitter Card (extended)
    'twitter:card': 'summary_large_image',
    'twitter:site': '@empowertours',
    'twitter:creator': '@empowertours',
    'twitter:title': 'EmpowerTours - DigitalPassport',
    'twitter:description': 'Mint and share Travel and Music NFTs on EmpowerTours.',
    'twitter:image': `${APP_URL}/images/og-image.png`,
    
    // Additional Manifest Frame Properties
    'frame:name': 'EmpowerTours',
    'frame:version': '1',
    'frame:iconUrl': `${APP_URL}/images/icon.png`,
    'frame:homeUrl': APP_URL,
    'frame:imageUrl': `${APP_URL}/images/feed.png`,
    'frame:buttonTitle': 'EmpowerTours',
    'frame:splashImageUrl': `${APP_URL}/images/splash.png`,
    'frame:splashBackgroundColor': '#353B48',
    'frame:webhookUrl': `${APP_URL}/api/webhook`,
    'frame:subtitle': 'Travel Stamp Buy Experiences',
    'frame:description': 'Mint and share Travel and Music NFTs on EmpowerTours, powered by Monad and Farcaster.',
    'frame:primaryCategory': 'social',
    'frame:heroImageUrl': `${APP_URL}/images/hero.png`,
    'frame:tagline': 'Unlock travel adventures',
    'frame:ogTitle': 'EmpowerTours - DigitalPassport',
    'frame:ogDescription': 'Mint and share Travel and Music NFTs on EmpowerTours.',
    'frame:ogImageUrl': `${APP_URL}/images/og-image.png`,
    'frame:castShareUrl': `${APP_URL}/share-cast`,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#353B48',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex flex-col min-h-screen">
        <Providers>
          <ClientNav />
          <main className="flex-1">{children}</main>
          <ClientBotFrame />
        </Providers>
      </body>
    </html>
  );
}
