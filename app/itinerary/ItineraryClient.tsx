'use client';
import { useState, useEffect } from 'react';
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

async function saveItineraryDraft(data: { 
  destination: string; 
  interests: string; 
  climbingPhoto: string | null; 
  climbingGrade: string 
}) {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem('itineraryDraft', JSON.stringify(data));
      console.log('Saved itinerary draft:', data);
    }
  } catch (error) {
    console.error('Failed to save itinerary draft:', error);
    throw error;
  }
}

interface Props {
  resolvedSearchParams: Record<string, string | string[] | undefined>;
}

export default function ItineraryClient({ resolvedSearchParams }: Props) {
  const [destination, setDestination] = useState('');
  const [interests, setInterests] = useState('');
  const [country, setCountry] = useState('Unknown');
  const [climbingPhoto, setClimbingPhoto] = useState<string | null>(null);
  const [climbingGrade, setClimbingGrade] = useState('');
  const [isMounted, setIsMounted] = useState(false);

  const { address, isConnected, isConnecting, isDisconnected, chainId } = useAccount();
  const { connect, connectors } = useConnect();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync, isPending } = useWriteContract();

  // Set mounted state
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Parse search params
  useEffect(() => {
    if (!isMounted) return;
    
    const prompt = resolvedSearchParams?.prompt;
    if (prompt && typeof prompt === 'string') {
      const words = prompt.split(' ');
      setDestination(words.slice(0, -2).join(' '));
      setInterests('rock climbing');
    }
  }, [isMounted, resolvedSearchParams]);

  // Auto-switch to Monad Testnet
  useEffect(() => {
    if (!isMounted || !isConnected || chainId === monadTestnet.id) return;
    
    const switchToMonad = async () => {
      try {
        await switchChainAsync({ chainId: monadTestnet.id });
        console.log('Switched to Monad Testnet');
        toast.success('Switched to Monad Testnet');
      } catch (error) {
        console.error('Chain switch failed:', error);
        toast.error('Failed to switch to Monad Testnet. Please switch manually.');
      }
    };
    
    switchToMonad();
  }, [isMounted, isConnected, chainId, switchChainAsync]);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setClimbingPhoto(url);
    }
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
    if (!isMounted) {
      console.log('Component not mounted yet');
      return;
    }

    if (!destination) {
      toast.error('Please provide a destination');
      return;
    }

    if (!isConnected || !address) {
      toast.error('Please connect your wallet');
      return;
    }

    if (!isAddress(address)) {
      toast.error('Invalid wallet address');
      return;
    }

    if (chainId !== monadTestnet.id) {
      toast.error('Please switch to Monad Testnet (Chain ID 10143)');
      return;
    }

    try {
      const metadata = { 
        destination, 
        country, 
        climbingGrade: climbingGrade || 'Not specified' 
      };
      const photoUri = climbingPhoto || 'ipfs://QmPK4TiGqmFRFuYuEVUecqvVy6gjpkoJquJ2Dm11P5ui9W';
      
      console.log('Minting itinerary:', { 
        address, 
        contract: ITINERARY_NFT_ADDRESS, 
        metadata, 
        photoUri 
      });

      const hash = await writeContractAsync({
        address: ITINERARY_NFT_ADDRESS,
        abi: ItineraryNFTABI,
        functionName: 'mintItinerary',
        args: [metadata, photoUri],
        chainId: monadTestnet.id,
      });

      toast.success(`Itinerary minted successfully! Tx: ${hash}`);
      
      // Reset form
      setDestination('');
      setInterests('');
      setClimbingPhoto(null);
      setClimbingGrade('');
    } catch (error: any) {
      console.error('Mint failed:', error);
      toast.error(`Mint failed: ${error.message || 'Unknown error'}`);
    }
  };

  if (!isMounted) {
    return (
      <div className="p-6 text-center text-gray-600">
        <p>Loading itinerary builder...</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Build Your Itinerary</CardTitle>
          {isConnected && (
            <p className="text-sm text-gray-600">
              Connected: {address?.slice(0, 6)}...{address?.slice(-4)}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Destination</label>
            <Input
              placeholder="e.g., Paris, Tokyo, New York"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Interests</label>
            <Input
              placeholder="e.g., culture, adventure, food"
              value={interests}
              onChange={(e) => setInterests(e.target.value)}
              className="w-full"
            />
          </div>

          <p className="text-sm text-gray-600">
            Based on your location: <span className="font-medium">{country}</span>
          </p>

          <Accordion type="single" collapsible>
            <AccordionItem value="climbing">
              <AccordionTrigger className="text-lg font-medium cursor-pointer hover:underline">
                Add Rock Climbing Details
              </AccordionTrigger>
              <AccordionContent className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Upload Climbing Photo</label>
                  <Input 
                    type="file" 
                    accept="image/*" 
                    onChange={handlePhotoUpload}
                    className="w-full"
                  />
                </div>

                {climbingPhoto && (
                  <div className="mt-2">
                    <Image
                      src={climbingPhoto}
                      width={128}
                      height={128}
                      alt="Climbing Preview"
                      className="rounded-lg object-cover"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium mb-2">Climbing Grade</label>
                  <select
                    value={climbingGrade}
                    onChange={(e) => setClimbingGrade(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md"
                  >
                    <option value="">Select Grade</option>
                    <option value="5.8">5.8 - Easy</option>
                    <option value="5.9">5.9 - Moderate</option>
                    <option value="5.10a">5.10a</option>
                    <option value="5.10b">5.10b</option>
                    <option value="5.10c">5.10c</option>
                    <option value="5.11a">5.11a</option>
                    <option value="5.11b">5.11b</option>
                    <option value="5.11c">5.11c</option>
                    <option value="5.12a">5.12a - Advanced</option>
                  </select>
                </div>

                <Button
                  onClick={handleMintStamp}
                  className="w-full"
                  disabled={!climbingGrade || isPending || !isConnected}
                >
                  {isPending ? 'Minting...' : 'Mint Climbing Stamp'}
                </Button>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <div className="flex space-x-2 pt-4">
            <Button 
              onClick={handleSaveDraft}
              variant="outline"
              className="flex-1"
              disabled={!destination}
            >
              Save Draft
            </Button>
            <Button 
              onClick={handleMintStamp} 
              disabled={!destination || isPending || !isConnected}
              className="flex-1"
            >
              {isPending ? 'Minting...' : 'Mint Itinerary'}
            </Button>
          </div>

          {!isConnected && (
            <p className="text-center text-sm text-orange-600 mt-4">
              ⚠️ Please connect your wallet to mint
            </p>
          )}

          {isConnected && chainId !== monadTestnet.id && (
            <p className="text-center text-sm text-orange-600 mt-4">
              ⚠️ Please switch to Monad Testnet
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
