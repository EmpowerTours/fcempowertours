'use client';
import { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useSwitchChain, useWaitForTransactionReceipt, useConnect } from 'wagmi';
import { Abi, isAddress } from 'viem';
import { sdk } from '@farcaster/miniapp-sdk';
import MusicNFTABI from '../../lib/abis/MusicNFT.json';
import { monadTestnet } from '../chains';

// Real MusicNFT address
const MUSIC_NFT_ADDRESS = '0x53f8650e96d47338b1106a085b3804e77f92d9ca';

// Force dynamic to skip prerender
export const dynamic = 'force-dynamic';

export default function MusicPage() {
  const { address, isConnected, chainId } = useAccount();
  const { writeContractAsync, isPending: writePending, data: writeData } = useWriteContract();
  const { switchChainAsync } = useSwitchChain();
  const { connect, connectors } = useConnect();
  const { data: receipt, isLoading: receiptLoading } = useWaitForTransactionReceipt({ hash: writeData });
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [txHash, setTxHash] = useState<string | undefined>(undefined);

  // Mount after hydration to avoid mismatches
  useEffect(() => {
    setMounted(true);
  }, []);

  // Auto-switch to Monad Testnet
  useEffect(() => {
    if (!mounted || !isConnected || chainId === monadTestnet.id) return;
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
  }, [mounted, isConnected, chainId, switchChainAsync]);

  // Handle TX receipt
  useEffect(() => {
    if (receipt) {
      setTxHash(receipt.transactionHash);
      alert(`TX Confirmed! Hash: ${receipt.transactionHash}\nView on explorer: https://explorer.monad.xyz/tx/${receipt.transactionHash}`);
    }
  }, [receipt]);

  const handleAudioChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setAudioFile(e.target.files[0]);
  };

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setCoverFile(e.target.files[0]);
  };

  // Helper: File to Base64
  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== 'string') {
          reject(new Error('Failed to convert file to base64: Result is not a string'));
          return;
        }
        const base64Match = result.match(/^data:[^;]+;base64,(.+)$/);
        if (!base64Match) {
          reject(new Error('Failed to convert file to base64: Invalid data URL format'));
          return;
        }
        resolve(base64Match[1]);
      };
      reader.onerror = () => reject(new Error('FileReader failed to read the file'));
    });

  const uploadToPinata = async () => {
    if (!audioFile || !coverFile || !description || !address || !isAddress(address)) {
      console.error('Invalid input for minting music NFT:', { audioFile, coverFile, description, address });
      alert('Need audio, cover image, description, and a valid wallet address (40-character hex).');
      return;
    }
    if (chainId !== monadTestnet.id) {
      alert('Please switch to Monad Testnet (Chain ID 10143) in your wallet.');
      return;
    }
    if (!process.env.MUSICNFT_ADDRESS) {
      console.error('Music NFT contract address is not defined');
      alert('Contract address not configured. Contact support.');
      return;
    }
    setUploading(true);
    try {
      if (!isConnected) await connect({ connector: connectors[0] });
      // Get Farcaster FID
      const context = await sdk.context;
      const fid = context?.user?.fid?.toString() || 'Unknown';
      // Upload to Pinata
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
      console.log('Pinata Ready:', { audioCid, metadataCid });
      // Convert cover to base64
      const coverArtBase64 = await fileToBase64(coverFile);
      // Get audio bytes for preview
      const audioContent = await audioFile.arrayBuffer();
      // Validate arguments
      if (!isAddress(address)) {
        throw new Error('Invalid address format');
      }
      if (typeof `ipfs://${metadataCid}` !== 'string') {
        throw new Error('Invalid metadataCid format');
      }
      if (!(audioContent instanceof ArrayBuffer)) {
        throw new Error('Invalid audio content format');
      }
      if (typeof coverArtBase64 !== 'string') {
        throw new Error('Invalid coverArtBase64 format');
      }
      console.log('Minting music NFT with:', {
        address,
        tokenURI: `ipfs://${metadataCid}`,
        previewLength: audioContent.byteLength,
        coverArtBase64Length: coverArtBase64.length,
        contractAddress: MUSIC_NFT_ADDRESS,
      });
      // Mint on-chain
      await writeContractAsync({
        address: MUSIC_NFT_ADDRESS as `0x${string}`,
        abi: MusicNFTABI as Abi,
        functionName: 'mint',
        args: [
          address,
          `ipfs://${metadataCid}`,
          new Uint8Array(audioContent),
          coverArtBase64,
          address,
        ],
        chainId: monadTestnet.id,
        account: address,
      });
      setTxHash(writeData);
      alert(`Mint requested! 🎵\nMetadata: ipfs://${metadataCid}\nAudio: ipfs://${audioCid}\nWaiting for TX confirmation...`);
    } catch (error) {
      console.error('Upload/Mint failed:', {
        message: (error as Error).message,
        stack: (error as Error).stack,
        address,
        contractAddress: MUSIC_NFT_ADDRESS,
      });
      alert(`Failed: ${(error as Error).message}. Check browser console for details.`);
    } finally {
      setUploading(false);
    }
  };

  if (!mounted) {
    return <div>Loading...</div>;
  }

  if (!isConnected) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }} suppressHydrationWarning>
        <h1>Music App</h1>
        <appkit-connect-button label="Connect Wallet to Mint Music NFTs" />
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }} suppressHydrationWarning>
      <h1>Mint Music NFT</h1>
      <p>Connected: {address}</p>
      <p>Chain: {chainId === monadTestnet.id ? 'Monad Testnet (Ready)' : 'Wrong chain - Switch to ID 10143'}</p>
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
        onClick={uploadToPinata}
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
      {txHash && <p>TX Hash: {txHash} (View on <a href={`https://explorer.monad.xyz/tx/${txHash}`} target="_blank" rel="noopener noreferrer">explorer</a>)</p>}
      <p><small>Tip: Use short audio (&lt;30s) to save gas on preview bytes. Free Pinata: 1GB/month.</small></p>
    </div>
  );
}
