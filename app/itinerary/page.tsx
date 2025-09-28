'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useWriteContract } from 'wagmi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { toast } from 'sonner';
import { saveItineraryDraft, encryptData, generateKey } from '@/lib/storage';
import Image from 'next/image';

export default function ItineraryPage() {
  const [destination, setDestination] = useState('');
  const [interests, setInterests] = useState('');
  const [country, setCountry] = useState('Unknown');
  const [climbingPhoto, setClimbingPhoto] = useState<string | null>(null);
  const [climbingGrade, setClimbingGrade] = useState('');
  const searchParams = useSearchParams();
  const { writeContract } = useWriteContract();

  useEffect(() => {
    const prompt = searchParams.get('prompt');
    if (prompt) {
      setDestination(prompt.split(' ').slice(0, -2).join(' '));
      setInterests('rock climbing');
    }
    fetch('/api/geo')
      .then((res) => res.json())
      .then(({ country }) => setCountry(country || 'Unknown'));
  }, [searchParams]);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setClimbingPhoto(URL.createObjectURL(file));
  };

  const handleSaveDraft = async () => {
    const key = await generateKey();
    const data = { destination, interests, climbingPhoto, climbingGrade };
    const { iv, encrypted } = await encryptData(data, key);
    saveItineraryDraft('draft-1', { iv, encrypted, data });
    toast('Draft Saved', { description: 'Itinerary saved locally.' });
  };

  const handleMintStamp = async () => {
    const metadata = { destination, country, climbingGrade };
    await writeContract({
      address: process.env.NEXT_PUBLIC_ITINERARY_ADDRESS,
      abi: [/* Your ABI from lib/abis/PassportNFT.json */],
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
