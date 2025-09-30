'use client';

import { useState } from 'react';
import { create } from 'ipfs-http-client';
import { sdk } from '@farcaster/miniapp-sdk';

// Configure IPFS client
const ipfs = create({ url: 'https://ipfs.infura.io:5001' });

export default function MusicPage() {
  const [file, setFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState({ name: '', artist: '' });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setFile(e.target.files[0]);
  };

  const uploadToIPFS = async () => {
    if (!file) return;
    try {
      const fileContent = await file.arrayBuffer();
      const { cid } = await ipfs.add(fileContent);
      const metadataJSON = {
        name: metadata.name,
        artist: metadata.artist,
        image: `ipfs://${cid}/cover.jpg`,
        animation_url: `ipfs://${cid}/audio.mp3`,
        traits: [{ trait_type: 'Creator FID', value: sdk.user?.fid || 'Unknown' }],
      };
      const metadataCid = await ipfs.add(JSON.stringify(metadataJSON));
      alert(`Uploaded to IPFS: ipfs://${metadataCid.cid}`);
    } catch (error) {
      console.error('IPFS upload failed:', error);
      alert('Failed to upload to IPFS');
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>Mint Music NFT</h1>
      <input
        type="text"
        placeholder="Name"
        value={metadata.name}
        onChange={(e) => setMetadata({ ...metadata, name: e.target.value })}
      />
      <input
        type="text"
        placeholder="Artist"
        value={metadata.artist}
        onChange={(e) => setMetadata({ ...metadata, artist: e.target.value })}
      />
      <input type="file" onChange={handleFileChange} />
      <button onClick={uploadToIPFS} disabled={!file}>Upload to IPFS</button>
    </div>
  );
}
