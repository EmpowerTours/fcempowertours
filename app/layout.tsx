import React from 'react';
import { Providers } from "./providers";
import "./globals.css";
import { Metadata } from 'next';

export const metadata: Metadata = {
  metadataBase: new URL('https://fcempowertours-production-6551.up.railway.app'),
  title: "EmpowerTours",
  description: "Farcaster Mini App for Hackathon",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
