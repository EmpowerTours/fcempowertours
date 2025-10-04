'use client';
import { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useSwitchChain, useWaitForTransactionReceipt } from 'wagmi';
import { Abi } from 'viem';
import { sdk } from '@farcaster/miniapp-sdk';
import MusicNFTABI from '../../lib/abis/MusicNFT.json'; // ABI array
// Real MusicNFT address
const MUSIC_NFT_ADDRESS = '0x53f8650e96d47338b1106a085b3804e77f92d9ca';
// Force dynamic to skip prerender
export const dynamic = 'force-dynamic';
export default function MusicPage() {
  const { address, isConnected, chainId } = useAccount();
  const { writeContract, isPending: writePending, data: writeData } = useWriteContract();
  const { switchChainAsync } = useSwitchChain();
  const { data: receipt, isLoading: receiptLoading } = useWaitForTransactionReceipt({ hash: writeData });
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [mounted, setMounted] = useState(false); // Track post-hydration mount
  const [txHash, setTxHash] = useState<string | undefined>(undefined);
  // Mount after hydration to avoid mismatches on client-only state
  useEffect(() => {
    setMounted(true);
  }, []);
  // Auto-switch to Monad testnet on connect (post-mount)
  useEffect(() => {
    if (!mounted || !isConnected || chainId === 10143) return;
    const autoSwitchChain = async () => {
      try {
        await switchChainAsync({ chainId: 10143 });
        console.log('Switched to Monad Testnet');
      } catch (error) {
        console.error('Chain switch failed:', error);
        alert('Failed to switch to Monad Testnet. Please switch manually in your wallet and retry.');
      }
    };
    autoSwitchChain();
  }, [mounted, isConnected, chainId, switchChainAsync]);
  // Handle TX receipt (success/fail)
  useEffect(() => {
    if (receipt) {
      console.log('TX Receipt:', receipt);
      alert(`TX Confirmed! Hash: ${receipt.transactionHash}\nView on explorer: https://explorer.monad.xyz/tx/${receipt.transactionHash}`);
      setTxHash(receipt.transactionHash);
    }
  }, [receipt]);
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
      reader.onload = () => resolve((reader.result as string).split(',')[1]); // Strip data: URL prefix
      reader.onerror = error => reject(error);
    });
  const uploadToIPFS = async () => {
    if (!audioFile || !coverFile || !description || !address) {
      alert('Need audio, cover image, description, and wallet connection.');
      return;
    }
    if (chainId !== 10143) {
      alert('Please switch to Monad Testnet (Chain ID 10143) in your wallet.');
      return;
    }
    setUploading(true);
    try {
      // Step 1: Get Farcaster FID client-side
      const context = await sdk.context;
      const fid = context?.user?.fid?.toString() || 'Unknown';
      // Step 2: POST to server API for secure Pinata upload
      const formData = new FormData();
      formData.append('audio', audioFile);
      formData.append('description', description);
      formData.append('fid', fid);
      formData.append('address', address);
      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      if (!uploadRes.ok) {
        throw new Error(`Upload failed: ${uploadRes.statusText}`);
      }
      const { audioCid, metadataCid } = await uploadRes.json();
      if (!audioCid || !metadataCid) {
        throw new Error('Upload failed: Invalid response from server');
      }
      console.log('IPFS Ready:', { audioCid, metadataCid });
      // Step 3: Convert cover to base64 (client-side for on-chain)
      const coverArtBase64 = await fileToBase64(coverFile);
      // Step 4: Get audio bytes for preview (client-side)
      const audioContent = await audioFile.arrayBuffer();
      // Step 5: Mint on-chain with error handling
      try {
        await writeContract({
          address: MUSIC_NFT_ADDRESS as `0x${string}`,
          abi: MusicNFTABI as Abi, // Direct array cast
          functionName: 'mint',
          args: [
            address, // to
            `ipfs://${metadataCid}`, // tokenURI
            new Uint8Array(audioContent), // preview bytes (short clip for gas)
            coverArtBase64, // coverArtBase64
            address, // artist
          ],
        });
        setTxHash(writeData); // Track hash for receipt wait
        alert(`Mint requested! 🎵\nMetadata: ipfs://${metadataCid}\nAudio: ipfs://${audioCid}\nWaiting for TX confirmation...`);
      } catch (writeError) {
        console.error('writeContract failed:', writeError);
        throw new Error(`Mint TX failed: ${(writeError as Error).message}. Check wallet/network.`);
      }
    } catch (error) {
      console.error('Upload/Mint failed:', error);
      alert(`Failed: ${(error as Error).message}`);
    } finally {
      setUploading(false);
    }
  };
  // Show loading if not mounted (brief sync)
  if (!mounted) {
    return <div>Loading...</div>;
  }
  if (!isConnected) {
    return (
      <div
        style={{ padding: '20px', textAlign: 'center' }}
        suppressHydrationWarning // Ignore mismatches on wallet state
      >
        <h1>Music App</h1>
        <appkit-connect-button label="Connect Wallet to Mint Music NFTs" />
      </div>
    );
  }
  return (
    <div
      style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}
      suppressHydrationWarning // Ignore mismatches on wallet state
    >
      <h1>Mint Music NFT</h1>
      <p>Connected: {address}</p>
      <p>Chain: {chainId === 10143 ? 'Monad Testnet (Ready)' : 'Wrong chain - Switch to ID 10143'}</p>
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
        <input type="file" accept="audio/mp3,audio/mpeg,audio/wav" onChange={handleAudioChange} />
        {audioFile && <p>Selected: {audioFile.name}</p>}
      </div>
      <div style={{ marginBottom: '20px' }}>
        <label>Cover Art (image):</label>
        <input type="file" accept="image/*" onChange={handleCoverChange} />
        {coverFile && <p>Selected: {coverFile.name}</p>}
      </div>
      <button
        onClick={uploadToIPFS}
        disabled={!audioFile || !coverFile || !description || uploading || writePending || receiptLoading}
        style={{
          padding: '10px 20px',
          background: '#0070f3',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: (uploading || writePending || receiptLoading) ? 'not-allowed' : 'pointer',
        }}
      >
        {uploading ? 'Uploading to Pinata...' : writePending ? 'Awaiting Wallet Approval...' : receiptLoading ? 'Confirming TX...' : 'Upload & Mint NFT'}
      </button>
      {(uploading || writePending || receiptLoading) && <p>Processing... (Server upload → Blockchain)</p>}
      {txHash && <p>TX Hash: {txHash} (View on https://explorer.monad.xyz/tx/{txHash})</p>}
      <p>
        <small>Tip: Use short audio (&lt;30s) to save gas on preview bytes. Free Pinata: 1GB/month.</small>
      </p>
    </div>
  );
}
