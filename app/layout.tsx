import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { cookieToInitialState } from 'wagmi';
import { Providers } from './providers';
import { getConfig } from './music/config';
import './globals.css';
import ClientLayout from './ClientLayout.tsx';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'),
  title: 'EmpowerTours',
  description: 'Plan, mint, and explore with EmpowerTours',
  openGraph: {
    title: 'EmpowerTours - Digital Passport',
    description: 'Mint and share Travel and Music NFTs on EmpowerTours.',
    images: ['/images/og-image.png'],
    url: process.env.NEXT_PUBLIC_URL || 'http://localhost:3000',
    siteName: 'EmpowerTours',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'EmpowerTours - Digital Passport',
    description: 'Mint and share Travel and Music NFTs on EmpowerTours.',
    images: ['/images/og-image.png'],
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const cookie = headersList.get('cookie');
  const config = getConfig();
  const initialState = cookieToInitialState(config, cookie);

  return (
    <html lang="en" className="h-full">
      <body className="min-h-screen bg-gradient-to-b from-[#0f172a] via-[#0b1223] to-[#08111e] text-foreground antialiased flex flex-col">
        <Providers initialState={initialState}>
          <ClientLayout>{children}</ClientLayout>
        </Providers>
      </body>
    </html>
  );
}
