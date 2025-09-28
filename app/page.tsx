'use client';

import { useEffect, useState } from 'react';
import { useReadContract } from 'wagmi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import { toast } from 'sonner';
import { sdk } from '@farcaster/miniapp-sdk';
import BottomNav from '@/components/BottomNav';

interface NFT {
  id: string;
  name: string;
  destination?: string;
  image?: string;
  animation_url?: string;
  type: 'travel' | 'music';
}

export default function Home() {
  const [nfts, setNfts] = useState<NFT[]>([]);
  const appUrl = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';

  // Fetch sample NFTs (Travel and Music)
  const { data: travelData } = useReadContract({
    address: process.env.NEXT_PUBLIC_ITINERARY_ADDRESS,
    abi: require('@/lib/abis/PassportNFT.json'),
    functionName: 'getAvailableItineraries',
    args: [],
  });

  const { data: musicData } = useReadContract({
    address: process.env.NEXT_PUBLIC_MUSIC_NFT_ADDRESS,
    abi: require('@/lib/abis/MusicNFT.json'),
    functionName: 'getAvailableMusicNfts',
    args: [],
  });

  useEffect(() => {
    // Call sdk.actions.ready() to hide splash screen
    const initialize = async () => {
      await sdk.actions.ready();
    };
    initialize();

    // Combine NFTs
    const combinedNfts: NFT[] = [];
    if (travelData) {
      const travelNfts = (travelData as any[]).map((item) => ({
        id: item.id.toString(),
        name: item.name || item.destination,
        destination: item.destination,
        image: item.image || '/images/screenshot3.png',
        type: 'travel' as const,
      }));
      combinedNfts.push(...travelNfts);
    }
    if (musicData) {
      const musicNfts = (musicData as any[]).map((item) => ({
        id: item.id.toString(),
        name: item.name,
        image: item.image || '/images/screenshot3.png',
        animation_url: item.animation_url,
        type: 'music' as const,
      }));
      combinedNfts.push(...musicNfts);
    }
    setNfts(combinedNfts.slice(0, 3)); // Limit to 3 for preview
  }, [travelData, musicData]);

  return (
    <>
      <head>
        <meta
          name="fc:miniapp"
          content={JSON.stringify({
            version: '1',
            imageUrl: `${appUrl}/images/feed.png`,
            button: {
              title: 'Explore Tours & Music',
              action: {
                type: 'launch_miniapp',
                name: 'EmpowerTours',
                url: appUrl,
                splashImageUrl: `${appUrl}/images/splash.png`,
                splashBackgroundColor: '#00A55E',
              },
            },
          })}
        />
        <meta
          name="og:image"
          content={`${appUrl}/api/og?title=EmpowerTours&description=Mint%20and%20share%20Travel%20and%20Music%20NFTs!`}
        />
      </head>
      <div className="p-4 space-y-6 min-h-screen flex flex-col">
        <Card className="flex-grow">
          <CardHeader>
            <CardTitle>Welcome to EmpowerTours</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Image
              src="/images/splash.png"
              width={200}
              height={200}
              alt="EmpowerTours Splash"
              className="mx-auto"
            />
            <p>Mint and share Travel and Music NFTs!</p>
            <div className="grid grid-cols-1 gap-4">
              {nfts.length ? (
                nfts.map((nft) => (
                  <Card key={`${nft.type}-${nft.id}`}>
                    <CardContent className="space-y-2">
                      {nft.image && (
                        <Image
                          src={nft.image}
                          width={150}
                          height={225}
                          alt={nft.name}
                          className="w-full rounded-lg"
                        />
                      )}
                      {nft.animation_url && (
                        <audio controls src={nft.animation_url} className="w-full mt-2" />
                      )}
                      <p className="font-semibold">{nft.name}</p>
                      {nft.type === 'travel' && nft.destination && (
                        <p>{nft.destination}</p>
                      )}
                      {nft.type === 'music' && <p>Music NFT</p>}
                    </CardContent>
                  </Card>
                ))
              ) : (
                <p>No NFTs available. Check the market!</p>
              )}
            </div>
            <Button onClick={() => window.location.href = '/market'}>
              Visit Market
            </Button>
            <Button
              variant="outline"
              className="ml-2"
              onClick={() => window.location.href = '/music'}
            >
              Mint Music NFT
            </Button>
          </CardContent>
        </Card>
        <BottomNav />
      </div>
    </>
  );
}
