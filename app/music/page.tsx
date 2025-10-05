'use client';
import { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useSwitchChain, useWaitForTransactionReceipt, useConnect } from 'wagmi';
import { Abi, isAddress } from 'viem';
import { sdk } from '@farcaster/miniapp-sdk';
import MusicNFTABI from '../../lib/abis/MusicNFT.json';
import { monadTestnet } from '../chains';

const MUSIC_NFT_ADDRESS = '0x53f8650e96d47338b1106a085b3804e77f92d9ca';

export const dynamic = 'force-dynamic';

export default function MusicPage() {
  const { address, isConnected, chainId, isConnecting, isDisconnected } = useAccount();
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

  useEffect(() => {
    setMounted(true);
  }, []);

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
      console.error('Invalid input for minting music NFT:', { audioFile, coverFile, description, address, isConnected, isConnecting, isDisconnected });
      alert('Need audio, cover image, description, and a valid wallet address (40-character hex).');
      return;
    }
    if (chainId !== monadTestnet.id) {
      alert('Please switch to Monad Testnet (Chain ID 10143) in your wallet.');
      return;
    }
    setUploading(true);
    try {
      if (!isConnected) await connect({ connector: connectors[0] });
      const context = await sdk.context;
      const fid = context?.user?.fid?.toString() || 'Unknown';
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
      const coverArtBase64 = await fileToBase64(coverFile);
      const audioContent = await audioFile.arrayBuffer();
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
      await writeContractAsync({
        address: MUSIC_NFT_ADDRESS,
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
    return <div className="text-gray-900">Loading...</div>;
  }

  if (!isConnected) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }} className="bg-gray-100" suppressHydrationWarning>
        <h1 className="text-gray-900">Music App</h1>
        <appkit-connect-button label="Connect Wallet to Mint Music NFTs" />
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }} className="bg-gray-100" suppressHydrationWarning>
      <h1 className="text-gray-900">Mint Music NFT</h1>
      <p className="text-gray-900">Connected: {address}</p>
      <p className="text-gray-900">Chain: {chainId === monadTestnet.id ? 'Monad Testnet (Ready)' : 'Wrong chain - Switch to ID 10143'}</p>
      <div style={{ marginBottom: '20px' }}>
        <label className="text-gray-900">Description:</label>
        <input
          type="text"
          placeholder="Describe your track"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={{ width: '100%', padding: '8px', margin: '5px 0' }}
          className="text-gray-900 bg-white"
        />
      </div>
      <div style={{ marginBottom: '20px' }}>
        <label className="text-gray-900">Audio File (short clip for preview):</label>
        <input type="file" accept="audio/mp3,audio/mpeg,audio/wav" onChange={handleAudioChange} className="text-gray-900" />
        {audioFile && <p className="text-gray-900">Selected: {audioFile.name}</p>}
      </div>
      <div style={{ marginBottom: '20px' }}>
        <label className="text-gray-900">Cover Art (image):</label>
        <input type="file" accept="image/*" onChange={handleCoverChange} className="text-gray-900" />
        {coverFile && <p className="text-gray-900">Selected: {coverFile.name}</p>}
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
      {(uploading || writePending || receiptLoading) && <p className="text-gray-900">Processing... (Server upload → Blockchain)</p>}
      {txHash && <p className="text-gray-900">TX Hash: {txHash} (View on <a href={`https://explorer.monad.xyz/tx/${txHash}`} target="_blank" rel="noopener noreferrer">explorer</a>)</p>}
      <p className="text-gray-900"><small>Tip: Use short audio (&lt;30s) to save gas on preview bytes. Free Pinata: 1GB/month.</small></p>
    </div>
  );
}
