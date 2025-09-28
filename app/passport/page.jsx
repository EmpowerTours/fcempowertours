'use client';

import { useState } from 'react';
import { useReadContract } from 'wagmi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Image from 'next/image';

export default function PassportPage() {
  const [stamps, setStamps] = useState([]);
  const { data } = useReadContract({
    address: process.env.NEXT_PUBLIC_ITINERARY_ADDRESS,
    abi: [/* Your ABI */],
    functionName: 'getUserStamps',
    args: [],
  });

  return (
    <div className="p-4 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Your Travel Passport</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {stamps.length ? (
              stamps.map(stamp => (
                <Card key={stamp.id}>
                  <CardContent>
                    {stamp.image && (
                      <Image src={stamp.image} width={200} height={300} alt={stamp.destination} className="w-full" />
                    )}
                    <p className="font-semibold">{stamp.destination}</p>
                    <p>{stamp.country}</p>
                  </CardContent>
                </Card>
              ))
            ) : (
              <p>No stamps yet. Mint one!</p>
            )}
          </div>
          <Button className="mt-4" onClick={() => window.location.href = '/itinerary'}>
            Create New Itinerary
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
