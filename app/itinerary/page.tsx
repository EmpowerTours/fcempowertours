import { Suspense } from 'react';
import ItineraryWrapper from './ItineraryWrapper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // Disable static generation

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>> | undefined;
}

export default function ItineraryPage({ searchParams }: PageProps) {
  return (
    <Suspense fallback={<div className="p-6 text-center text-gray-600">Loading itinerary...</div>}>
      <ItineraryWrapper searchParams={searchParams ?? Promise.resolve({})} />
    </Suspense>
  );
}
