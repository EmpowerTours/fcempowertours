import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Venue Player — EmpowerTours',
  description: 'PRO-free music streaming for venues, powered by EmpowerTours on Monad',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Venue Player',
  },
};

export const viewport: Viewport = {
  themeColor: '#0a0a0f',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function VenueLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link rel="apple-touch-icon" href="/venue-icon-192.png" />
      {children}
    </>
  );
}
