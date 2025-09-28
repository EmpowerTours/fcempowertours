"use client";
import { useAudio } from './AudioContext';
import { useMusic } from './MusicContext';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { createHeliaHTTP } from '@helia/http';
import { unixfs } from '@helia/unixfs';
const WagmiWrapper = dynamic(() => import('./WagmiWrapper'), { ssr: false });
export default function MusicPage() {
  const { audioRef } = useAudio();
  const { shortSong, setShortSong, fullSongIPFS, setFullSongIPFS, coverArtIPFS, setCoverArtIPFS, setPlaylist, setStatus } = useMusic();
  const uploadToPinata = async (file) => {
    if (!file) return null;
    try {
      const helia = await createHeliaHTTP();  // Create Helia instance
      const fs = unixfs(helia);  // UnixFS for adding files
      const fileContent = await file.arrayBuffer();  // Get file bytes
      const cid = await fs.add(new Uint8Array(fileContent));  // Add to IPFS
      return `https://gateway.pinata.cloud/ipfs/${cid.toString()}`;  // Pinata gateway URL
    } catch (error) {
      console.error(error);
      throw new Error('Upload failed');
    }
  };
  // Rest of the file unchanged (handleCoverArtUpload, etc.)
}
