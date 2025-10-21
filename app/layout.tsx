import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';
import ClientNav from './components/ClientNav';
import SimpleBotBar from './components/SimpleBotBar';
import SDKProvider from './components/SDKProvider';
import Script from 'next/script';

const APP_URL = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';

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
      <head>
        {/* Mobile debugger - TEMPORARY, remove after debugging */}
        <Script 
          src="https://cdn.jsdelivr.net/npm/eruda"
          strategy="beforeInteractive"
        />
        <Script id="eruda-init" strategy="beforeInteractive">
          {`
            if (typeof eruda !== 'undefined') {
              eruda.init();
            }
          `}
        </Script>
      </head>
      <body className="flex flex-col min-h-screen">
        <Providers>
          <SDKProvider>
            {/* Navigation at top */}
            <ClientNav />
            
            {/* AI Agent command bar directly below navigation */}
            <SimpleBotBar />
            
            {/* Main content area */}
            <main className="flex-1">{children}</main>
          </SDKProvider>
        </Providers>
      </body>
    </html>
  );
}
