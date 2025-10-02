'use client';

import { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useSwitchChain } from 'wagmi';
import { Abi } from 'viem';
import { create } from 'ipfs-http-client';
import { sdk } from '@farcaster/miniapp-sdk';
import MusicNFTABI from '../../lib/abis/MusicNFT.json';  // Updated ABI

// Configure IPFS client
const ipfs = create({ url: 'https://ipfs.infura.io:5001' });

// Real MusicNFT address
const MUSIC_NFT_ADDRESS = '0x53f8650e96d47338b1106a085b3804e77f92d9ca';

export default function MusicPage() {
  const { address, isConnected } = useAccount();
  const { writeContract, isPending } = useWriteContract();
  const { switchChainAsync } = useSwitchChain();  // Use async version
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);

  // Auto-switch to Monad testnet on connect
  useEffect(() => {
    const autoSwitchChain = async () => {
      if (isConnected) {
        try {
          await switchChainAsync({ chainId: 10143 });
        } catch {
          console.warn("Could not switch chain automatically. Please switch manually in your wallet.");
        }
      }
    };
    autoSwitchChain();
  }, [isConnected, switchChainAsync]);

  const handleAudioChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setAudioFile(e.target.files[0]);
  };

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setCoverFile(e.target.files[0]);
  };

  // Helper: File to Base64 (for coverArtBase64)
  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(',')[1]);  // Strip data: URL prefix
      reader.onerror = error => reject(error);
    });

  const uploadToIPFS = async () => {
    if (!audioFile || !coverFile || !description || !address) {
      alert('Need audio, cover image, description, and wallet connection.');
      return;
    }
    setUploading(true);
    try {
      // Step 1: Upload audio to IPFS (for reference, but preview uses bytes)
      const audioContent = await audioFile.arrayBuffer();
      const { cid: audioCid } = await ipfs.add(audioContent);

      // Step 2: Await Farcaster context
      const context = await sdk.context;
      const fid = context?.user?.fid?.toString() || 'Unknown';

      // Step 3: Create & upload metadata JSON to IPFS
      const metadataJSON = {
        name: `Music Track - ${audioFile.name}`,
        description,
        animation_url: `ipfs://${audioCid}`,
        attributes: [
          { trait_type: 'Creator Address', value: address },
          { trait_type: 'Creator FID', value: fid },
        ],
      };
      const { cid: metadataCid } = await ipfs.add(JSON.stringify(metadataJSON, null, 2));

      console.log('IPFS Ready:', { audioCid, metadataCid });

      // Step 4: Convert cover to base64
      const coverArtBase64 = await fileToBase64(coverFile);

      // Step 5: Mint on-chain
      await writeContract({
        address: MUSIC_NFT_ADDRESS as `0x${string}`,
        abi: MusicNFTABI as unknown as Abi,
        functionName: 'mint',
        args: [
          address,  // to
          `ipfs://${metadataCid}`,  // tokenURI
          new Uint8Array(audioContent),  // preview bytes (full audio—use short clip for gas)
          coverArtBase64,  // coverArtBase64
          address,  // artist
        ],
      });

      alert(`Minted! 🎵\nMetadata: ipfs://${metadataCid}\nAudio: ipfs://${audioCid}\nToken in wallet—check explorer.`);
    } catch (error) {
      console.error('Upload/Mint failed:', error);
      alert(`Failed: ${(error as Error).message}`);
    } finally {
      setUploading(false);
    }
  };

  if (!isConnected) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h1>Music App</h1>
        <w3m-button label="Connect Wallet to Mint Music NFTs" />
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Mint Music NFT</h1>
      <p>Connected: {address}</p>

      <div style={{ marginBottom: '20px' }}>
        <label>Description:</label>
        <input
          type="text"
          placeholder="Describe your track"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={{ width: '100%', padding: '8px', margin: '5px 0' }}
        />
      </div>

      <div style={{ marginBottom: '20px' }}>
        <label>Audio File (short clip for preview):</label>
        <input type="file" accept="audio/*" onChange={handleAudioChange} />
        {audioFile && <p>Selected: {audioFile.name}</p>}
      </div>

      <div style={{ marginBottom: '20px' }}>
        <label>Cover Art (image):</label>
        <input type="file" accept="image/*" onChange={handleCoverChange} />
        {coverFile && <p>Selected: {coverFile.name}</p>}
      </div>

      <button
        onClick={uploadToIPFS}
        disabled={!audioFile || !coverFile || !description || uploading || isPending}
        style={{
          padding: '10px 20px',
          background: '#0070f3',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: (uploading || isPending) ? 'not-allowed' : 'pointer',
        }}
      >
        {uploading ? 'Uploading to IPFS...' : isPending ? 'Minting...' : 'Upload & Mint NFT'}
      </button>

      {(uploading || isPending) && <p>Processing... (IPFS then blockchain)</p>}
      <p><small>Tip: Use short audio (&lt;30s) to save gas on preview bytes.</small></p>
    </div>
  );
}
