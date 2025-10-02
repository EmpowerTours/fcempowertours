// app/itinerary/page.tsx (Server Component)
import { Suspense } from 'react';
import ItineraryClient from './ItineraryClient';

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function ItineraryPage({ searchParams }: PageProps) {
  return (
    <div>
      <Suspense fallback={<div className="p-4">Loading itinerary...</div>}>
        <ItineraryClient searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
