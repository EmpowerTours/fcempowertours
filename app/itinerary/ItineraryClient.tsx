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

const ITINERARY_NFT_ADDRESS = '0x382072Abe7Eb9f72c08b1BDB252FE320F0d00934' as `0x${string}`;

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
  const { address, isConnected, isConnecting, isDisconnected, chainId } = useAccount();
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
    if (!destination || !isConnected || isConnecting || isDisconnected || !address || !isAddress(address)) {
      console.error('Invalid input for minting itinerary:', { destination, isConnected, isConnecting, isDisconnected, address });
      alert('Please provide a destination and connect a valid wallet address (40-character hex).');
      return;
    }
    if (chainId !== monadTestnet.id) {
      alert('Please switch to Monad Testnet (Chain ID 10143) in your wallet.');
      return;
    }
    try {
      if (!isConnected) await connect({ connector: connectors[0] });
      const metadata = { destination, country, climbingGrade };
      const photoUri = climbingPhoto || 'ipfs://placeholder';
      console.log('Minting itinerary with:', {
        address,
        contractAddress: ITINERARY_NFT_ADDRESS,
        metadata,
        climbingPhoto: photoUri,
      });
      await writeContractAsync({
        address: ITINERARY_NFT_ADDRESS,
        abi: ItineraryNFTABI,
        functionName: 'mintItinerary',
        args: [metadata, photoUri],
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
        contractAddress: ITINERARY_NFT_ADDRESS,
        metadata: { destination, country, climbingGrade },
        climbingPhoto: climbingPhoto || 'ipfs://placeholder',
      });
      alert(`Failed to mint itinerary: ${(error as Error).message}. Check browser console for details.`);
    }
  };

  return (
    <div style={{ backgroundColor: '#f3f4f6 !important' }} className="p-4 space-y-6">
      <Card style={{ backgroundColor: '#f9fafb !important' }}>
        <CardHeader>
          <CardTitle style={{ color: '#111827 !important' }}>Build Your Itinerary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Destination (e.g., Paris)"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            style={{ backgroundColor: '#ffffff !important', color: '#111827 !important' }}
            className="p-2 border rounded"
          />
          <Input
            placeholder="Interests (e.g., culture, adventure)"
            value={interests}
            onChange={(e) => setInterests(e.target.value)}
            style={{ backgroundColor: '#ffffff !important', color: '#111827 !important' }}
            className="p-2 border rounded"
          />
          <p style={{ color: '#111827 !important' }} className="text-sm">Based on your location: {country}</p>
          <Accordion type="single" collapsible>
            <AccordionItem value="climbing">
              <AccordionTrigger style={{ color: '#111827 !important' }}>Add Rock Climbing</AccordionTrigger>
              <AccordionContent>
                <Input type="file" accept="image/*" onChange={handlePhotoUpload} style={{ color: '#111827 !important' }} />
                {climbingPhoto && (
                  <Image src={climbingPhoto} width={128} height={128} alt="Climbing Preview" className="object-cover mt-2" />
                )}
                <select
                  value={climbingGrade}
                  onChange={(e) => setClimbingGrade(e.target.value)}
                  style={{ backgroundColor: '#ffffff !important', color: '#111827 !important' }}
                  className="mt-2 w-full p-2 border rounded"
                >
                  <option value="">Select Grade</option>
                  <option value="5.10a">5.10a</option>
                  <option value="5.11b">5.11b</option>
                </select>
                <Button onClick={handleMintStamp} style={{ backgroundColor: '#2563eb !important', color: '#ffffff !important' }} className="mt-2" disabled={!climbingGrade}>
                  Mint Climbing Stamp
                </Button>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
          <div className="flex space-x-2">
            <Button onClick={handleSaveDraft} style={{ backgroundColor: '#2563eb !important', color: '#ffffff !important' }}>Save Draft</Button>
            <Button onClick={handleMintStamp} style={{ backgroundColor: '#2563eb !important', color: '#ffffff !important' }} disabled={!destination}>Mint Itinerary</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
