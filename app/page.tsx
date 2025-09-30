'use client';

import { useEffect, useState } from 'react';
import { createWeb3Modal, defaultWagmiConfig } from '@web3modal/wagmi/react';
import { WagmiConfig, useReadContract } from 'wagmi';
import { Abi } from 'viem';
import { farcaster } from '@farcaster/miniapp-wagmi-connector';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import { sdk } from '@farcaster/miniapp-sdk';
import BottomNav from '@/components/BottomNav';
import ItineraryMarketABI from '../lib/abis/ItineraryMarket.json';
import MusicNFTABI from '../lib/abis/MusicNFT.json';

// Configure Wagmi for Monad chain
const projectId = process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || 'YOUR_WALLET_CONNECT_PROJECT_ID';
const chains = [
  {
    chainId: 10143,
    name: 'Monad',
    currency: 'MONAD',
    explorerUrl: 'https://explorer.monad.xyz',
    rpcUrl: process.env.NEXT_PUBLIC_MONAD_RPC_URL || 'https://rpc.monad.xyz',
  },
];

const wagmiConfig = defaultWagmiConfig({
  chains,
  projectId,
  metadata: {
    name: 'EmpowerTours',
    description: 'Travel Itinerary Marketplace',
    url: 'https://yourapp.com',
    icons: ['https://yourapp.com/icon.png'],
  },
  connectors: [farcaster()],
});

createWeb3Modal({ wagmiConfig, projectId, chains });

const ITINERARY_MARKET_ADDRESS = process.env.NEXT_PUBLIC_ITINERARY_ADDRESS || '0x48a4b5b9f97682a4723ebfd0086c47c70b96478c';
const MUSIC_NFT_ADDRESS = process.env.NEXT_PUBLIC_MUSIC_NFT_ADDRESS || '0xYOUR_MUSIC_NFT_ADDRESS'; // Replace with actual address

interface TravelNFT {
  id: bigint;
  name: string;
  destination: string;
  image: string;
  type: 'travel';
}

interface MusicNFT {
  id: bigint;
  name: string;
  image: string;
  animation_url: string;
  type: 'music';
}

type NFT = TravelNFT | MusicNFT;

export default function Home() {
  const [nfts, setNfts] = useState<NFT[]>([]);
  const appUrl = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';

  // Fetch available itineraries
  const { data: travelData } = useReadContract({
    address: ITINERARY_MARKET_ADDRESS as `0x${string}`,
    abi: ItineraryMarketABI.abi as Abi,
    functionName: 'getAvailableItineraries',
    args: [],
  });

  // Fetch available music NFTs
  const { data: musicData } = useReadContract({
    address: MUSIC_NFT_ADDRESS as `0x${string}`,
    abi: MusicNFTABI.abi as Abi,
    functionName: 'getAvailableMusicNfts',
    args: [],
  });

  useEffect(() => {
    const initialize = async () => {
      await sdk.actions.ready();
    };
    initialize();

    const combinedNfts: NFT[] = [];
    if (travelData) {
      const travelNfts = (travelData as readonly { id: bigint; name: string; destination: string; image: string }[]).map(
        (item) => ({
          id: item.id,
          name: item.name || item.destination,
          destination: item.destination,
          image: item.image || '/images/screenshot3.png',
          type: 'travel' as const,
        })
      );
      combinedNfts.push(...travelNfts);
    }
    if (musicData) {
      const musicNfts = (musicData as readonly { id: bigint; name: string; image: string; animation_url: string }[]).map(
        (item) => ({
          id: item.id,
          name: item.name,
          image: item.image || '/images/screenshot3.png',
          animation_url: item.animation_url,
          type: 'music' as const,
        })
      );
      combinedNfts.push(...musicNfts);
    }
    setNfts(combinedNfts.slice(0, 3));
  }, [travelData, musicData]);

  return (
    <WagmiConfig config={wagmiConfig}>
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
                      {'animation_url' in nft && nft.animation_url && (
                        <audio controls src={nft.animation_url} className="w-full mt-2" />
                      )}
                      <p className="font-semibold">{nft.name}</p>
                      {nft.type === 'travel' && 'destination' in nft && nft.destination && <p>{nft.destination}</p>}
                      {nft.type === 'music' && <p>Music NFT</p>}
                    </CardContent>
                  </Card>
                ))
              ) : (
                <p>No NFTs available. Check the market!</p>
              )}
            </div>
            <Button onClick={() => window.location.href = '/market'}>Visit Market</Button>
            <Button variant="outline" className="ml-2" onClick={() => window.location.href = '/music'}>
              Mint Music NFT
            </Button>
          </CardContent>
        </Card>
        <BottomNav />
      </div>
    </WagmiConfig>
  );
}
