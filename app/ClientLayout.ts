'use client';
import { useEffect, useState } from 'react';
import ClientNav from '@/components/ClientNav';
import ClientBotFrame from '@/components/ClientBotFrame';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    console.log('ClientLayout mounted');
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    console.log('ClientLayout: Rendering loading state');
    return <div>Loading layout...</div>;
  }

  console.log('ClientLayout: Rendering main content', { children: typeof children });
  return (
    <>
      <ClientNav />
      <main className="flex-1 mx-auto max-w-xl px-3 pt-3 overflow-y-auto">{children}</main>
      <ClientBotFrame />
    </>
  );
}
