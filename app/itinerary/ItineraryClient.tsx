// app/itinerary/ItineraryClient.tsx (Client Component)
'use client';

import { useState, useEffect } from 'react';
import { use } from 'react';  // For unwrapping promised searchParams
import { useWriteContract } from 'wagmi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { toast } from 'sonner';
import { saveItineraryDraft } from '@/lib/storage';
import Image from 'next/image';

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default function ItineraryClient({ searchParams: promisedParams }: Props) {
  const resolvedParams = use(promisedParams);  // Unwrap promised params
  const [destination, setDestination] = useState('');
  const [interests, setInterests] = useState('');
   
  const [country, _setCountry] = useState('Unknown'); // TODO: Use setCountry for country selection
  const [climbingPhoto, setClimbingPhoto] = useState<string | null>(null);
  const [climbingGrade, setClimbingGrade] = useState('');
  const { writeContract } = useWriteContract();

  useEffect(() => {
  const prompt = resolvedParams?.prompt;  // Direct access; ? for safety (though use() ensures non-null)
  if (prompt) {
    setDestination((prompt as string).split(' ').slice(0, -2).join(' '));  // Cast to string (handles single-value case)
    setInterests('rock climbing');
  }
}, [resolvedParams]);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setClimbingPhoto(URL.createObjectURL(file));
  };

  const handleSaveDraft = async () => {
    const data = { 
      destination, 
      interests, 
      climbingPhoto, 
      climbingGrade 
    };
    await saveItineraryDraft(data);  // Pass raw data; let saveItineraryDraft handle encryption/storage
    toast('Draft Saved', { description: 'Itinerary saved locally.' });
  };

  const handleMintStamp = async () => {
    const metadata = { destination, country, climbingGrade };
    await writeContract({
      address: process.env.NEXT_PUBLIC_ITINERARY_ADDRESS as `0x${string}`,
      abi: (await import('@/lib/abis/PassportNFT.json')).default,
      functionName: 'mintItinerary',
      args: [metadata, 'ipfs://...'],
    });
    toast('Stamp Minted', { description: 'Added to your passport!' });
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
