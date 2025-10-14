'use client';
import { use } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import ItineraryClient with SSR disabled
const ItineraryClient = dynamic(() => import('./ItineraryClient'), { 
  ssr: false,
  loading: () => <div className="p-6 text-center">Loading itinerary form...</div>
});

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default function ItineraryWrapper({ searchParams }: Props) {
  // Unwrap the Promise using React.use()
  const resolvedParams = use(searchParams);
  
  // Pass the resolved params as a regular object
  return <ItineraryClient resolvedSearchParams={resolvedParams} />;
}
