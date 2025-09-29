'use client';

import { useState } from 'react';
import { useAudio } from './AudioContext';
import { useMusic } from './MusicContext';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useWriteContract } from 'wagmi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { createHeliaHTTP } from '@helia/http';
import { unixfs } from '@helia/unixfs';

const WagmiWrapper = dynamic(() => import('./WagmiWrapper'), { ssr: false });

export default function MusicPage() {
  const { audioRef } = useAudio();
  const { setShortSong, setFullSongIPFS, setCoverArtIPFS } = useMusic();
  const { writeContract } = useWriteContract();
  const [genre, setGenre] = useState('');

  const uploadToPinata = async (file: File | null): Promise<string | null> => {
    if (!file) return null;
    try {
      const helia = await createHeliaHTTP();
      const fs = unixfs(helia);
      const fileContent = await file.arrayBuffer();
      const cid = await fs.add(new Uint8Array(fileContent));
      return `https://gateway.pinata.cloud/ipfs/${cid.toString()}`;
    } catch (error) {
      console.error(error);
      toast('Upload failed', { description: 'Failed to upload file to IPFS.' });
      return null;
    }
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const ipfsUrl = await uploadToPinata(file);
      if (ipfsUrl) {
        setFullSongIPFS(ipfsUrl);
        setShortSong(URL.createObjectURL(file));
        toast('Audio uploaded', { description: 'Audio file ready for minting.' });
      }
    }
  };

  const handleCoverArtUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const ipfsUrl = await uploadToPinata(file);
      if (ipfsUrl) {
        setCoverArtIPFS(ipfsUrl);
        toast('Cover art uploaded', { description: 'Cover image ready for minting.' });
      }
    }
  };

  const handleMint = async () => {
    const fullSongIPFS = window.localStorage.getItem('fullSongIPFS');
    if (!fullSongIPFS) {
      toast('Error', { description: 'Please upload an audio file.' });
      return;
    }

    const coverArtIPFS = window.localStorage.getItem('coverArtIPFS') || '/images/screenshot3.png';
    const metadata = {
      name: 'Paris Journey Soundtrack',
      description: `Music for Paris trip, ${genre || 'Unknown'}`,
      image: coverArtIPFS,
      animation_url: fullSongIPFS,
      attributes: [
        { trait_type: 'Genre', value: genre || 'Unknown' },
        { trait_type: 'Trip', value: 'Paris, France' },
        { trait_type: 'Creator FID', value: window.farcaster?.user.fid || 'Unknown' },
      ],
    };

    await writeContract({
      address: process.env.NEXT_PUBLIC_MUSIC_NFT_ADDRESS as `0x${string}`,
      abi: (await import('@/lib/abis/MusicNFT.json')).default,
      functionName: 'mint',
      args: [metadata],
    });

    toast('Minted!', { description: 'Music NFT added to your passport.' });
  };

  return (
    <WagmiWrapper>
      <div className="p-4 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Upload Music NFT</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input type="file" accept="audio/mp3" onChange={handleAudioUpload} />
            <Input type="file" accept="image/*" onChange={handleCoverArtUpload} />
            <Select onValueChange={setGenre} value={genre}>
              <SelectTrigger>
                <SelectValue placeholder="Select Genre" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Ambient">Ambient</SelectItem>
                <SelectItem value="Classical">Classical</SelectItem>
                <SelectItem value="Electronic">Electronic</SelectItem>
                <SelectItem value="Jazz">Jazz</SelectItem>
                <SelectItem value="Rock">Rock</SelectItem>
                <SelectItem value="Pop">Pop</SelectItem>
              </SelectContent>
            </Select>
            {window.localStorage.getItem('shortSong') && (
              <audio ref={audioRef} controls src={window.localStorage.getItem('shortSong')!} className="w-full mt-2" />
            )}
            {window.localStorage.getItem('coverArtIPFS') && (
              <Image
                src={window.localStorage.getItem('coverArtIPFS')!}
                width={200}
                height={300}
                alt="Cover Art"
                className="object-cover mt-2"
              />
            )}
            <Button onClick={handleMint} disabled={!window.localStorage.getItem('fullSongIPFS')}>
              Mint Music NFT
            </Button>
          </CardContent>
        </Card>
      </div>
    </WagmiWrapper>
  );
}
