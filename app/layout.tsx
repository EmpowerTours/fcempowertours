import type { Metadata, Viewport } from 'next';
import './globals.css';
import ClientProviders from './ClientProviders';
import ClientNav from './components/ClientNav';
import SimpleBotBar from './components/SimpleBotBar';
import SDKProvider from './components/SDKProvider';

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
      <body className="flex flex-col min-h-screen">
        <ClientProviders>
          <SDKProvider>
            <ClientNav />
            <SimpleBotBar />
            <main className="flex-1">{children}</main>
          </SDKProvider>
        </ClientProviders>
      </body>
    </html>
  );
}
