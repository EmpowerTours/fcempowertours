import React from 'react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { cookieToInitialState } from 'wagmi';
import BottomNav from '@/components/BottomNav';
import { Providers } from './providers';
import { getConfig } from './music/config';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'),
  title: 'EmpowerTours',
  description: 'Plan, mint, and explore with EmpowerTours',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const cookie = headersList.get('cookie');
  const initialState = cookieToInitialState(getConfig(), cookie);

  return (
    <html lang="en" className="h-full">
      <body className="min-h-screen bg-gradient-to-b from-[#0f172a] via-[#0b1223] to-[#08111e] text-foreground antialiased">
        <Providers initialState={initialState}>
          <div className="mx-auto max-w-xl px-3 pt-3 pb-20">
            {children}
            <BottomNav />
          </div>
        </Providers>
      </body>
    </html>
  );
}
