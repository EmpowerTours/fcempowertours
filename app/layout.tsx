'use client';

import React, { useEffect } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';
import { Providers } from "./providers";  // If missing, create as below or remove if not needed
import "./globals.css";
import { Metadata } from 'next';

export const metadata: Metadata = {
  metadataBase: new URL('http://localhost:3000'),
  title: "EmpowerTours",
  description: "Farcaster Mini App for Hackathon",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    sdk.actions.ready().catch(console.error);  // Hide splash
  }, []);

  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
