'use client';
import dynamic from 'next/dynamic';
import { Suspense } from 'react';

// Dynamically import ClientProviders with SSR disabled
const ClientProviders = dynamic(() => import('./ClientProviders'), { ssr: false });

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div>Loading providers...</div>}>
      <ClientProviders>{children}</ClientProviders>
    </Suspense>
  );
}
