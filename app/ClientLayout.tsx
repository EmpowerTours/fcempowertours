'use client';
import { useEffect, useState } from 'react';
import ClientNav from '@/components/ClientNav';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    console.log('ClientLayout: Mounted');
    setIsMounted(true);
  }, []);

  console.log('ClientLayout: Rendering', {
    isMounted,
    childrenType: typeof children,
  });

  if (!isMounted) {
    console.log('ClientLayout: Returning loading state');
    return <div>Loading layout...</div>;
  }

  return (
    <>
      <ClientNav />
      <main className="flex-1 mx-auto max-w-xl px-3 pt-3 overflow-y-auto">{children}</main>
    </>
  );
}
