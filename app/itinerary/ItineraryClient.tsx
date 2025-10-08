'use client';
import { useState, useEffect } from 'react';
import { use } from 'react';
import { useAccount, useConnect, useSwitchChain, useWriteContract } from 'wagmi';
import { isAddress } from 'viem';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@radix-ui/react-accordion';
import { toast } from 'sonner';
import Image from 'next/image';
import { monadTestnet } from '../chains';
import ItineraryNFTABI from '@/lib/abis/ItineraryNFT.json';

const ITINERARY_NFT_ADDRESS = '0x382072Abe7Eb9f72c08b1BDB252FE320F0d00934' as `0x${string}`;

async function saveItineraryDraft(data: { destination: string; interests: string; climbingPhoto: string | null; climbingGrade: string }) {
  try {
    localStorage.setItem('itineraryDraft', JSON.stringify(data));
    console.log('Saved itinerary draft:', data);
  } catch (error) {
    console.error('Failed to save itinerary draft:', error);
    throw error;
  }
}

export const runtime = 'nodejs';

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default function ItineraryClient({ searchParams }: Props) {
  const [destination, setDestination] = useState('');
  const [interests, setInterests] = useState('');
  const [country, setCountry] = useState('Unknown');
  const [climbingPhoto, setClimbingPhoto] = useState<string | null>(null);
  const [climbingGrade, setClimbingGrade] = useState('');
  const [isClient, setIsClient] = useState(false);

  // Initialize wagmi hooks only on client side
  const wagmiHooks = typeof window !== 'undefined' ? {
    account: useAccount(),
    connect: useConnect(),
    switchChain: useSwitchChain(),
    writeContract: useWriteContract(),
  } : {
    account: { address: undefined, isConnected: false, isConnecting: false, isDisconnected: true, chainId: undefined },
    connect: { connect: () => {}, connectors: [] },
    switchChain: { switchChainAsync: async () => {} },
    writeContract: { writeContractAsync: async () => {} },
  };

  const { address, isConnected, isConnecting, isDisconnected, chainId } = wagmiHooks.account;
  const { connect, connectors } = wagmiHooks.connect;
  const { switchChainAsync } = wagmiHooks.switchChain;
  const { writeContractAsync } = wagmiHooks.writeContract;

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient) return;
    const resolvedParams = use(searchParams);
    const prompt = resolvedParams?.prompt;
    if (prompt && typeof prompt === 'string') {
      setDestination(prompt.split(' ').slice(0, -2).join(' '));
      setInterests('rock climbing');
    }
  }, [isClient, searchParams]);

  useEffect(() => {
    if (!isClient || !isConnected || chainId === monadTestnet.id) return;
    const switchToMonad = async () => {
      try {
        await switchChainAsync({ chainId: monadTestnet.id });
        console.log('Switched to Monad Testnet');
      } catch (error) {
        console.error('Chain switch failed:', error);
        toast.error('Failed to switch to Monad Testnet. Please switch manually.');
      }
    };
    switchToMonad();
  }, [isClient, isConnected, chainId, switchChainAsync]);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setClimbingPhoto(URL.createObjectURL(file));
  };

  const handleSaveDraft = async () => {
    try {
      await saveItineraryDraft({ destination, interests, climbingPhoto, climbingGrade });
      toast.success('Draft saved locally');
    } catch (error) {
      console.error('Failed to save draft:', error);
      toast.error('Failed to save draft');
    }
  };

  const handleMintStamp = async () => {
    if (!isClient) {
      console.log('Skipping mint on server-side render');
      return;
    }
    if (!destination || !isConnected || isConnecting || isDisconnected || !address || !isAddress(address)) {
      console.error('Invalid input for minting:', { destination, isConnected, isConnecting, isDisconnected, address });
      toast.error('Please provide a destination and connect a valid wallet');
      return;
    }
    if (chainId !== monadTestnet.id) {
      toast.error('Please switch to Monad Testnet (Chain ID 10143)');
      return;
    }
    try {
      if (!isConnected) await connect({ connector: connectors[0] });
      const metadata = { destination, country, climbingGrade };
      const photoUri = climbingPhoto || 'ipfs://QmPK4TiGqmFRFuYuEVUecqvVy6gjpkoJquJ2Dm11P5ui9W';
      console.log('Minting itinerary:', { address, contract: ITINERARY_NFT_ADDRESS, metadata, photoUri });
      await writeContractAsync({
        address: ITINERARY_NFT_ADDRESS,
        abi: ItineraryNFTABI,
        functionName: 'mintItinerary',
        args: [metadata, photoUri],
        chainId: monadTestnet.id,
        account: address,
      });
      toast.success('Itinerary minted successfully');
    } catch (error: any) {
      console.error('Mint failed:', error);
      toast.error(`Mint failed: ${error.message}`);
    }
  };

  return (
    <div className="p-4 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Build Your Itinerary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Destination (e.g., Paris)"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          />
          <Input
            placeholder="Interests (e.g., culture, adventure)"
            value={interests}
            onChange={(e) => setInterests(e.target.value)}
          />
          <p className="text-sm text-gray-600">Based on your location: {country}</p>
          <Accordion type="single" collapsible>
            <AccordionItem value="climbing">
              <AccordionTrigger>Add Rock Climbing</AccordionTrigger>
              <AccordionContent>
                <Input type="file" accept="image/*" onChange={handlePhotoUpload} />
                {climbingPhoto && (
                  <Image
                    src={climbingPhoto}
                    width={128}
                    height={128}
                    alt="Climbing Preview"
                    className="mt-2 object-cover"
                  />
                )}
                <select
                  value={climbingGrade}
                  onChange={(e) => setClimbingGrade(e.target.value)}
                  className="mt-2 w-full p-2 border rounded"
                >
                  <option value="">Select Grade</option>
                  <option value="5.10a">5.10a</option>
                  <option value="5.11b">5.11b</option>
                </select>
                <Button
                  onClick={handleMintStamp}
                  className="mt-2"
                  disabled={!climbingGrade}
                >
                  Mint Climbing Stamp
                </Button>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
          <div className="flex space-x-2">
            <Button onClick={handleSaveDraft}>Save Draft</Button>
            <Button onClick={handleMintStamp} disabled={!destination}>
              Mint Itinerary
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
