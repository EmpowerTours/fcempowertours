'use client';
import dynamic from 'next/dynamic';

// Dynamically import ItineraryClient with SSR disabled
const ItineraryClient = dynamic(() => import('./ItineraryClient'), { ssr: false });

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default function ItineraryWrapper({ searchParams }: Props) {
  return <ItineraryClient searchParams={searchParams} />;
}
