'use client';

import { useState } from 'react';
import { useWriteContract } from 'wagmi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { hub } from '@farcaster/miniapp-wagmi-connector';
import Image from 'next/image';

export default function MarketPage() {
  const [itineraries, setItineraries] = useState([
    { id: 1, title: 'Paris Adventure', yield: '4% APY', image: '/images/screenshot3.png' },
  ]);
  const { writeContract } = useWriteContract();

  const handleBuy = async (id) => {
    await writeContract({
      address: process.env.NEXT_PUBLIC_ITINERARY_ADDRESS,
      abi: [/* Your ABI */],
      functionName: 'buyItinerary',
      args: [id],
      value: BigInt(10000000000000000),
    });
    toast({ title: 'Purchased!', description: 'Itinerary added to your passport.' });
  };

  const handleShare = async (id, title) => {
    await hub.cast({
      text: `Bought ${title} on EmpowerTours!`,
      embeds: [{ url: `https://fcempowertours-production-6551.up.railway.app/itinerary/${id}` }],
    });
    toast({ title: 'Shared!', description: 'Posted to Farcaster.' });
  };

  return (
    <div className="p-4 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Travel Marketplace</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {itineraries.map(item => (
              <Card key={item.id}>
                <CardContent className="flex justify-between items-center">
                  <div>
                    <Image src={item.image} width={100} height={150} alt={item.title} className="w-24 h-36 object-cover" />
                    <p className="font-semibold">{item.title}</p>
                    <p>Yield: {item.yield}</p>
                  </div>
                  <div className="space-x-2">
                    <Button onClick={() => handleBuy(item.id)}>Buy</Button>
                    <Button variant="outline" onClick={() => handleShare(item.id, item.title)}>Share</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
