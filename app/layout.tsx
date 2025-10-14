import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { cookieToInitialState } from 'wagmi';
import { Providers } from './providers';
import { getConfig } from './music/config';
import ClientNav from './components/ClientNav';
import './globals.css';

const baseUrl = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: 'EmpowerTours - Digital Passport',
  description: 'Mint and share Travel and Music NFTs on EmpowerTours, powered by Monad and Farcaster.',
  openGraph: {
    title: 'EmpowerTours - Digital Passport',
    description: 'Mint and share Travel and Music NFTs on EmpowerTours.',
    images: [
      {
        url: `${baseUrl}/images/og-image.png`,
        width: 1200,
        height: 630,
        alt: 'EmpowerTours',
      }
    ],
    url: baseUrl,
    siteName: 'EmpowerTours',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'EmpowerTours - Digital Passport',
    description: 'Mint and share Travel and Music NFTs on EmpowerTours.',
    images: [`${baseUrl}/images/og-image.png`],
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const cookie = headersList.get('cookie');
  const config = getConfig();
  const initialState = cookieToInitialState(config, cookie);

  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="icon" href="/images/icon.png" />
      </head>
      <body className="min-h-screen bg-gradient-to-b from-[#0f172a] via-[#0b1223] to-[#08111e] text-foreground antialiased flex flex-col">
        <Providers initialState={initialState}>
          <ClientNav />
          <main className="flex-1 mx-auto max-w-xl px-3 pt-3 overflow-y-auto">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
