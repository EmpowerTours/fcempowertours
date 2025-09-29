'use client';

import { useState, useEffect } from 'react';
import { useReadContract, useWriteContract } from 'wagmi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { sdk } from '@farcaster/miniapp-sdk';
import Image from 'next/image';

interface Item {
  id: number;
  title: string;
  yield?: string;
  image: string;
  type: 'travel' | 'music';
}

export default function MarketPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [passportAbi, setPassportAbi] = useState<unknown>(null);
  const [musicAbi, setMusicAbi] = useState<unknown>(null);
  const { writeContract } = useWriteContract();

  useEffect(() => {
    async function loadAbis() {
      const passport = (await import('@/lib/abis/PassportNFT.json')).default;
      const music = (await import('@/lib/abis/MusicNFT.json')).default;
      setPassportAbi(passport);
      setMusicAbi(music);
    }
    loadAbis();
  }, []);

  const { data: travelData } = useReadContract({
    address: process.env.NEXT_PUBLIC_ITINERARY_ADDRESS as `0x${string}`,
    abi: passportAbi,
    functionName: 'getAvailableItineraries',
    args: [],
  });

  const { data: musicData } = useReadContract({
    address: process.env.NEXT_PUBLIC_MUSIC_NFT_ADDRESS as `0x${string}`,
    abi: musicAbi,
    functionName: 'getAvailableMusicNfts',
    args: [],
  });

  useEffect(() => {
    const combinedItems: Item[] = [];
    if (travelData) {
      const travelItems = (travelData as { id: bigint; name: string; destination: string; image: string; yield: string }[]).map(
        (item) => ({
          id: Number(item.id),
          title: item.name || item.destination,
          yield: item.yield || '4% APY',
          image: item.image || '/images/screenshot3.png',
          type: 'travel' as const,
        })
      );
      combinedItems.push(...travelItems);
    }
    if (musicData) {
      const musicItems = (musicData as { id: bigint; name: string; image: string }[]).map((item) => ({
        id: Number(item.id),
        title: item.name,
        image: item.image || '/images/screenshot3.png',
        type: 'music' as const,
      }));
      combinedItems.push(...musicItems);
    }
    setItems(combinedItems);
  }, [travelData, musicData]);

  const handleBuy = async (id: number, type: 'travel' | 'music') => {
    const contractAddress =
      type === 'travel'
        ? (process.env.NEXT_PUBLIC_ITINERARY_ADDRESS as `0x${string}`)
        : (process.env.NEXT_PUBLIC_MUSIC_NFT_ADDRESS as `0x${string}`);
    const abi = type === 'travel' ? passportAbi : musicAbi;
    const functionName = type === 'travel' ? 'buyItinerary' : 'buyMusicNft';

    await writeContract({
      address: contractAddress,
      abi,
      functionName,
      args: [id],
      value: BigInt(10000000000000000),
    });
    toast('Purchased!', { description: `${type === 'travel' ? 'Itinerary' : 'Music NFT'} added to your passport.` });
  };

  const handleShare = async (id: number, title: string, type: 'travel' | 'music') => {
    const url =
      type === 'travel'
        ? `https://fcempowertours-production-6551.up.railway.app/itinerary/${id}`
        : `https://fcempowertours-production-6551.up.railway.app/music/${id}`;
    await sdk.actions.composeCast({
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
            {items.map((item) => (
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
