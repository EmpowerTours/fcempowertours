'use client';

import { useState, useEffect } from 'react';
import { useWriteContract } from 'wagmi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { hub } from '@farcaster/miniapp-wagmi-connector';
import Image from 'next/image';
import { useReadContract } from 'wagmi';

interface Item {
  id: number;
  title: string;
  yield?: string;
  image: string;
  type: 'travel' | 'music';
}

export default function MarketPage() {
  const [itineraries, setItineraries] = useState<Item[]>([]);
  const [musicNfts, setMusicNfts] = useState<Item[]>([]);
  const { writeContract } = useWriteContract();

  // Fetch Travel NFTs
  const { data: travelData } = useReadContract({
    address: process.env.NEXT_PUBLIC_ITINERARY_ADDRESS,
    abi: require('@/lib/abis/PassportNFT.json'),
    functionName: 'getAvailableItineraries', // Adjust to your contract's function
    args: [],
  });

  // Fetch Music NFTs
  const { data: musicData } = useReadContract({
    address: process.env.NEXT_PUBLIC_MUSIC_NFT_ADDRESS,
    abi: require('@/lib/abis/MusicNFT.json'),
    functionName: 'getAvailableMusicNfts', // Adjust to your contract's function
    args: [],
  });

  useEffect(() => {
    // Process Travel NFTs
    if (travelData) {
      const travelItems = (travelData as any[]).map((item) => ({
        id: Number(item.id),
        title: item.name || item.destination,
        yield: item.yield || '4% APY',
        image: item.image || '/images/screenshot3.png',
        type: 'travel' as const,
      }));
      setItineraries(travelItems);
    }

    // Process Music NFTs
    if (musicData) {
      const musicItems = (musicData as any[]).map((item) => ({
        id: Number(item.id),
        title: item.name,
        image: item.image || '/images/screenshot3.png',
        type: 'music' as const,
      }));
      setMusicNfts(musicItems);
    }
  }, [travelData, musicData]);

  const handleBuy = async (id: number, type: 'travel' | 'music') => {
    const contractAddress =
      type === 'travel'
        ? process.env.NEXT_PUBLIC_ITINERARY_ADDRESS
        : process.env.NEXT_PUBLIC_MUSIC_NFT_ADDRESS;
    const abi = type === 'travel' ? require('@/lib/abis/PassportNFT.json') : require('@/lib/abis/MusicNFT.json');
    const functionName = type === 'travel' ? 'buyItinerary' : 'buyMusicNft'; // Adjust to your contract's function

    await writeContract({
      address: contractAddress,
      abi,
      functionName,
      args: [id],
      value: BigInt(10000000000000000), // Adjust value as needed
    });
    toast('Purchased!', { description: `${type === 'travel' ? 'Itinerary' : 'Music NFT'} added to your passport.` });
  };

  const handleShare = async (id: number, title: string, type: 'travel' | 'music') => {
    const url =
      type === 'travel'
        ? `https://fcempowertours-production-6551.up.railway.app/itinerary/${id}`
        : `https://fcempowertours-production-6551.up.railway.app/music/${id}`;
    await hub.cast({
      text: `Bought ${title} on EmpowerTours!`,
      embeds: [{ url }],
    });
    toast('Shared!', { description: 'Posted to Farcaster.' });
  };

  return (
    <div className="p-4 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Travel & Music Marketplace</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {itineraries.concat(musicNfts).map((item) => (
              <Card key={`${item.type}-${item.id}`}>
                <CardContent className="flex justify-between items-center">
                  <div>
                    <Image
                      src={item.image}
                      width={100}
                      height={150}
                      alt={item.title}
                      className="w-24 h-36 object-cover"
                    />
                    <p className="font-semibold">{item.title}</p>
                    {item.yield && <p>Yield: {item.yield}</p>}
                    <p>{item.type === 'travel' ? 'Travel Itinerary' : 'Music NFT'}</p>
                  </div>
                  <div className="space-x-2">
                    <Button onClick={() => handleBuy(item.id, item.type)}>Buy</Button>
                    <Button variant="outline" onClick={() => handleShare(item.id, item.title, item.type)}>
                      Share
                    </Button>
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
