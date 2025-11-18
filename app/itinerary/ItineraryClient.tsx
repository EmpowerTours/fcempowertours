'use client';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@radix-ui/react-accordion';
import { toast } from 'sonner';
import { useAccount } from 'wagmi';
import Image from 'next/image';

const ITINERARY_NFT_ADDRESS = process.env.NEXT_PUBLIC_ITINERARY_NFT || '0x5B61286AC88688fe8930711fAa5b1155e98daFe8';

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
  const [isMinting, setIsMinting] = useState(false);
  const [mintError, setMintError] = useState<string | null>(null);
  const [mintSuccess, setMintSuccess] = useState<string | null>(null);

  const { address, isConnected } = useAccount();

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

  // No chain switching needed - delegation handles everything

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
      setMintError('Please provide a destination');
      return;
    }

    if (!isConnected || !address) {
      toast.error('Please connect your wallet');
      setMintError('Please connect your wallet');
      return;
    }

    setIsMinting(true);
    setMintError(null);
    setMintSuccess(null);

    try {
      // Check for delegation
      const delegationRes = await fetch(`/api/delegation-status?address=${address}`);
      const delegationData = await delegationRes.json();

      const hasValidDelegation = delegationData.success &&
        delegationData.delegation &&
        Array.isArray(delegationData.delegation.permissions) &&
        delegationData.delegation.permissions.includes('mint_itinerary');

      if (!hasValidDelegation) {
        setMintSuccess('⏳ Setting up gasless transactions...');

        const createRes = await fetch('/api/create-delegation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress: address,
            durationHours: 24,
            maxTransactions: 100,
            permissions: ['mint_passport', 'mint_music', 'swap_mon_for_tours', 'send_tours', 'buy_music', 'stake_tours', 'unstake_tours', 'mint_itinerary']
          })
        });

        const createData = await createRes.json();
        if (!createData.success) {
          throw new Error('Failed to create delegation: ' + createData.error);
        }
      }

      setMintSuccess('⏳ Minting itinerary stamp (FREE - we pay gas)...');

      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: address,
          action: 'mint_itinerary',
          params: {
            destination,
            country,
            city: destination, // Use destination as city for simplicity
            climbingGrade: climbingGrade || 'Not specified',
            photoUri: climbingPhoto || '',
            description: interests ? `${destination} - ${interests}` : destination,
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Mint failed');
      }

      const { txHash } = await response.json();

      setMintSuccess(`🎉 Successfully minted itinerary stamp! TX: ${txHash.slice(0, 10)}...`);
      toast.success(`Itinerary minted successfully!`);

      // Reset form after delay
      setTimeout(() => {
        setDestination('');
        setInterests('');
        setClimbingPhoto(null);
        setClimbingGrade('');
        setMintSuccess(null);
      }, 3000);
    } catch (error: any) {
      console.error('Mint failed:', error);
      const errorMsg = error.message || 'Failed to mint itinerary';
      setMintError(errorMsg);
      toast.error(`Mint failed: ${errorMsg}`);
    } finally {
      setIsMinting(false);
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
          {/* Error/Success Messages */}
          {mintError && (
            <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
              <p className="text-red-700 font-medium">❌ {mintError}</p>
            </div>
          )}

          {mintSuccess && (
            <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4">
              <p className="text-green-700 font-medium">✅ {mintSuccess}</p>
            </div>
          )}

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
                  disabled={!climbingGrade || isMinting || !isConnected}
                >
                  {isMinting ? '⏳ Minting (Gasless)...' : '🚀 Mint Climbing Stamp (FREE)'}
                </Button>
                <p className="text-xs text-gray-500 text-center">
                  ✅ No gas fees! We pay for your transaction via delegation
                </p>
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
              disabled={!destination || isMinting || !isConnected}
              className="flex-1"
            >
              {isMinting ? '⏳ Minting (Gasless)...' : '🚀 Mint Itinerary (FREE)'}
            </Button>
          </div>

          {!isConnected && (
            <p className="text-center text-sm text-orange-600 mt-4">
              ⚠️ Please connect your wallet to mint
            </p>
          )}

          {isConnected && (
            <p className="text-center text-sm text-green-600 mt-4">
              ✅ Gasless minting enabled - no network switching required!
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
