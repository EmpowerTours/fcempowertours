'use client';
import { useState, useEffect } from 'react';
import { use, Suspense } from 'react';
import { useAccount, useConnect, useSwitchChain, useWriteContract } from 'wagmi';
import { isAddress } from 'viem';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { toast } from 'sonner';
import { saveItineraryDraft } from '@/lib/storage';
import Image from 'next/image';
import { monadTestnet } from '../chains';
import ItineraryNFTABI from '@/lib/abis/ItineraryNFT.json';

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default function ItineraryClient({ searchParams: promisedParams }: Props) {
  const resolvedParams = use(promisedParams);
  const [destination, setDestination] = useState('');
  const [interests, setInterests] = useState('');
  const [country, setCountry] = useState('Unknown');
  const [climbingPhoto, setClimbingPhoto] = useState<string | null>(null);
  const [climbingGrade, setClimbingGrade] = useState('');
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors } = useConnect();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  useEffect(() => {
    const prompt = resolvedParams?.prompt;
    if (prompt) {
      setDestination((prompt as string).split(' ').slice(0, -2).join(' '));
      setInterests('rock climbing');
    }
  }, [resolvedParams]);

  // Auto-switch to Monad Testnet
  useEffect(() => {
    if (!isConnected || chainId === monadTestnet.id) return;
    const autoSwitchChain = async () => {
      try {
        await switchChainAsync({ chainId: monadTestnet.id });
        console.log('Switched to Monad Testnet');
      } catch (error) {
        console.error('Chain switch failed:', {
          message: (error as Error).message,
          stack: (error as Error).stack,
        });
        alert('Failed to switch to Monad Testnet. Please switch manually in your wallet.');
      }
    };
    autoSwitchChain();
  }, [isConnected, chainId, switchChainAsync]);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setClimbingPhoto(URL.createObjectURL(file));
  };

  const handleSaveDraft = async () => {
    const data = {
      destination,
      interests,
      climbingPhoto,
      climbingGrade,
    };
    await saveItineraryDraft(data);
    toast('Draft Saved', { description: 'Itinerary saved locally.' });
  };

  const handleMintStamp = async () => {
    if (!destination || !isConnected || !address || !isAddress(address)) {
      console.error('Invalid input for minting itinerary:', { destination, isConnected, address });
      alert('Please provide a destination and connect a valid wallet address (40-character hex).');
      return;
    }
    if (chainId !== monadTestnet.id) {
      alert('Please switch to Monad Testnet (Chain ID 10143) in your wallet.');
      return;
    }
    if (!process.env.NEXT_PUBLIC_ITINERARY_ADDRESS) {
      console.error('Itinerary contract address is not defined');
      alert('Contract address not configured. Contact support.');
      return;
    }
    try {
      if (!isConnected) await connect({ connector: connectors[0] });
      const metadata = { destination, country, climbingGrade };
      console.log('Minting itinerary with:', {
        address,
        contractAddress: process.env.NEXT_PUBLIC_ITINERARY_ADDRESS,
        metadata,
        climbingPhoto: climbingPhoto || 'ipfs://placeholder',
      });
      await writeContractAsync({
        address: process.env.NEXT_PUBLIC_ITINERARY_ADDRESS as `0x${string}`,
        abi: ItineraryNFTABI,
        functionName: 'mintItinerary',
        args: [metadata, climbingPhoto ? climbingPhoto : 'ipfs://placeholder'],
        chainId: monadTestnet.id,
        account: address,
      });
      toast('Stamp Minted', { description: 'Added to your passport!' });
    } catch (error) {
      console.error('Mint itinerary failed:', {
        message: (error as Error).message,
        stack: (error as Error).stack,
        cause: (error as Error).cause,
        address,
        contractAddress: process.env.NEXT_PUBLIC_ITINERARY_ADDRESS,
      });
      alert(`Failed to mint itinerary: ${(error as Error).message}. Check browser console for details.`);
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
                  <Image src={climbingPhoto} width={128} height={128} alt="Climbing Preview" className="object-cover mt-2" />
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
                <Button onClick={handleMintStamp} className="mt-2" disabled={!climbingGrade}>
                  Mint Climbing Stamp
                </Button>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
          <div className="flex space-x-2">
            <Button onClick={handleSaveDraft}>Save Draft</Button>
            <Button onClick={handleMintStamp} disabled={!destination}>Mint Itinerary</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
