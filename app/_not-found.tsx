import { Metadata } from 'next';
import { Suspense } from 'react';

export const metadata: Metadata = {
  title: '404 - Not Found',
  description: 'Page not found',
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function NotFound() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <div className="p-6 text-center">
        <h1 className="text-3xl font-bold">404 - Page Not Found</h1>
        <p className="mt-4 text-gray-600">The page you are looking for does not exist.</p>
      </div>
    </Suspense>
  );
}
