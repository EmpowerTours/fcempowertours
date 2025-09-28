'use client';

import { useState, useEffect } from 'react';
import { useReadContract } from 'wagmi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import { toast } from 'sonner';

interface NFT {
  id: string;
  name: string;
  destination?: string;
  country?: string;
  image?: string;
  animation_url?: string;
  type: 'travel' | 'music';
}

export default function PassportPage() {
  const [stamps, setStamps] = useState<NFT[]>([]);
  
  // Fetch Travel NFTs
  const { data: travelData } = useReadContract({
    address: process.env.NEXT_PUBLIC_ITINERARY_ADDRESS,
    abi: require('@/lib/abis/PassportNFT.json'),
    functionName: 'getUserStamps',
    args: [],
  });

  // Fetch Music NFTs
  const { data: musicData } = useReadContract({
    address: process.env.NEXT_PUBLIC_MUSIC_NFT_ADDRESS,
    abi: require('@/lib/abis/MusicNFT.json'),
    functionName: 'getUserStamps', // Adjust to your contract's function name
    args: [],
  });

  useEffect(() => {
    const combinedStamps: NFT[] = [];
    
    // Process Travel NFTs
    if (travelData) {
      const travelStamps = (travelData as any[]).map((stamp) => ({
        id: stamp.id.toString(),
        name: stamp.name || stamp.destination,
        destination: stamp.destination,
        country: stamp.country,
        image: stamp.image,
        type: 'travel' as const,
      }));
      combinedStamps.push(...travelStamps);
    }

    // Process Music NFTs
    if (musicData) {
      const musicStamps = (musicData as any[]).map((stamp) => ({
        id: stamp.id.toString(),
        name: stamp.name,
        image: stamp.image,
        animation_url: stamp.animation_url,
        type: 'music' as const,
      }));
      combinedStamps.push(...musicStamps);
    }

    setStamps(combinedStamps);
  }, [travelData, musicData]);

  return (
    <div className="p-4 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Your Travel Passport</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {stamps.length ? (
              stamps.map((stamp) => (
                <Card key={`${stamp.type}-${stamp.id}`}>
                  <CardContent className="space-y-2">
                    {stamp.image && (
                      <Image
                        src={stamp.image}
                        width={200}
                        height={300}
                        alt={stamp.name}
                        className="w-full rounded-lg"
                      />
                    )}
                    {stamp.animation_url && (
                      <audio controls src={stamp.animation_url} className="w-full mt-2" />
                    )}
                    <p className="font-semibold">{stamp.name}</p>
                    {stamp.type === 'travel' && stamp.destination && (
                      <p>{stamp.destination}, {stamp.country}</p>
                    )}
                    {stamp.type === 'music' && (
                      <p>Music NFT</p>
                    )}
                  </CardContent>
                </Card>
              ))
            ) : (
              <p>No stamps or music NFTs yet. Mint one!</p>
            )}
          </div>
          <Button className="mt-4" onClick={() => window.location.href = '/itinerary'}>
            Create New Itinerary
          </Button>
          <Button className="mt-4 ml-2" variant="outline" onClick={() => window.location.href = '/music'}>
            Mint Music NFT
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
