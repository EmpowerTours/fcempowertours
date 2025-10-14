import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'EmpowerTours - DigitalPassport',
  description: 'Mint and share Travel and Music NFTs on EmpowerTours, powered by Monad and Farcaster.',
  keywords: ['travel', 'music', 'nfts', 'farcaster', 'monad', 'blockchain', 'web3'],
  authors: [{ name: 'EmpowerTours Team' }],
  creator: 'EmpowerTours',
  publisher: 'EmpowerTours',
  
  // Open Graph meta tags for Farcaster
  openGraph: {
    title: 'EmpowerTours - DigitalPassport',
    description: 'Mint and share Travel and Music NFTs on EmpowerTours.',
    url: 'https://fcempowertours-production-6551.up.railway.app',
    siteName: 'EmpowerTours',
    images: [
      {
        url: 'https://fcempowertours-production-6551.up.railway.app/images/og-image.png',
        width: 1200,
        height: 630,
        alt: 'EmpowerTours - Travel and Music NFTs',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  
  // Twitter Card meta tags
  twitter: {
    card: 'summary_large_image',
    title: 'EmpowerTours - DigitalPassport',
    description: 'Mint and share Travel and Music NFTs on EmpowerTours.',
    creator: '@empowertours',
    images: ['https://fcempowertours-production-6551.up.railway.app/images/og-image.png'],
  },
  
  // Icons
  icons: {
    icon: '/images/icon.png',
    shortcut: '/images/icon.png',
    apple: '/images/icon.png',
  },
  
  // Manifest
  manifest: '/manifest.json',
  
  // App configuration
  applicationName: 'EmpowerTours',
  appleWebApp: {
    capable: true,
    title: 'EmpowerTours',
    statusBarStyle: 'black-translucent',
  },
  
  // Viewport
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
  },
  
  // Other metadata
  metadataBase: new URL('https://fcempowertours-production-6551.up.railway.app'),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Farcaster Frame meta tags - must be in <head> */}
        <meta property="fc:frame" content="vNext" />
        <meta property="fc:frame:image" content="https://fcempowertours-production-6551.up.railway.app/images/feed.png" />
        <meta property="fc:frame:button:1" content="Open EmpowerTours" />
        <meta property="fc:frame:button:1:action" content="link" />
        <meta property="fc:frame:button:1:target" content="https://fcempowertours-production-6551.up.railway.app" />
        
        {/* Additional SEO tags */}
        <meta name="robots" content="index, follow" />
        <meta name="googlebot" content="index, follow" />
        
        {/* Theme color */}
        <meta name="theme-color" content="#353B48" />
        <meta name="msapplication-TileColor" content="#353B48" />
        
        {/* Canonical URL */}
        <link rel="canonical" href="https://fcempowertours-production-6551.up.railway.app" />
      </head>
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
