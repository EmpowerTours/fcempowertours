'use client';

import { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useSwitchChain, useWaitForTransactionReceipt, useConnect } from 'wagmi';
import { Abi, isAddress } from 'viem';
import { sdk } from '@farcaster/miniapp-sdk';
import MusicNFTABI from '../../lib/abis/MusicNFT.json';
import { monadTestnet } from '../chains';

const MUSIC_NFT_ADDRESS = '0x53f8650e96d47338b1106a085b3804e77f92d9ca';

export default function MusicPage() {
  const { address, isConnected, chainId } = useAccount();
  const { writeContractAsync, isPending: writePending, data: writeData } = useWriteContract();
  const { switchChainAsync } = useSwitchChain();
  const { connect, connectors } = useConnect();
  const { data: receipt, isLoading: receiptLoading } = useWaitForTransactionReceipt({ hash: writeData });

  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [fullFile, setFullFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [txHash, setTxHash] = useState<string | undefined>(undefined);
  const [isMounted, setIsMounted] = useState(false); // Hydration guard

  useEffect(() => setIsMounted(true), []);

  if (!isMounted) return <div>Loading...</div>;

  // Auto switch to Monad Testnet
  useEffect(() => {
    if (!isConnected || chainId === monadTestnet.id) return;
    switchChainAsync({ chainId: monadTestnet.id }).catch(() =>
      alert('Please switch to Monad Testnet manually in your wallet.')
    );
  }, [isConnected, chainId, switchChainAsync]);

  // Handle confirmed transaction
  useEffect(() => {
    if (receipt) {
      setTxHash(receipt.transactionHash);
      alert(`✅ TX Confirmed: https://explorer.monad.xyz/tx/${receipt.transactionHash}`);
    }
  }, [receipt]);

  const handleFileChange = (setter: React.Dispatch<React.SetStateAction<File | null>>) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) setter(e.target.files[0]);
    };

  const uploadAndMint = async () => {
    if (!previewFile || !fullFile || !coverFile || !description || !address) {
      alert('Please upload all required files and connect your wallet.');
      return;
    }
    if (chainId !== monadTestnet.id) {
      alert('Switch to Monad Testnet first.');
      return;
    }

    setUploading(true);
    try {
      if (!isConnected) await connect({ connector: connectors[0] });

      // Fixed: Await context and extract primitives only (no function)
      const context = await sdk.context;
      const fid = context?.user?.fid?.toString() || '1';
      console.log('SDK Context FID:', fid);  // Safe primitive

      const formData = new FormData();
      formData.append('previewAudio', previewFile);
      formData.append('fullAudio', fullFile);
      formData.append('cover', coverFile);
      formData.append('description', description);
      formData.append('fid', fid);
      formData.append('address', address);

      const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.statusText}`);
      const { metadataCid, previewCid, fullCid } = await uploadRes.json();

      console.log('Pinata upload complete:', { metadataCid, previewCid, fullCid });

      await writeContractAsync({
        address: MUSIC_NFT_ADDRESS,
        abi: MusicNFTABI as Abi,
        functionName: 'mint',
        args: [address, `ipfs://${metadataCid}`],
        chainId: monadTestnet.id,
        account: address,
      });

      alert(`🎵 Mint requested! Metadata: ipfs://${metadataCid}`);
    } catch (error) {
      console.error('Mint failed:', error);
      alert(`Error: ${(error as Error).message}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-4 max-w-[600px] mx-auto">
      <h1 className="text-2xl font-bold mb-3">Mint Streaming Music NFT</h1>
      <p>Connected: {address || 'Not connected'}</p>
      <p className="mb-3">
        Chain: {chainId === monadTestnet.id ? 'Monad Testnet ✅' : 'Wrong chain ❌'}
      </p>

      <label>Description:</label>
      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Describe your track"
        className="w-full p-2 border rounded mb-4"
      />

      <label>🎧 Preview Audio (3s NFT Clip)</label>
      <input type="file" accept="audio/*" onChange={handleFileChange(setPreviewFile)} className="mb-2" />
      {previewFile && <p>Selected: {previewFile.name}</p>}

      <label>🎵 Full Track (for streaming)</label>
      <input type="file" accept="audio/*" onChange={handleFileChange(setFullFile)} className="mb-2" />
      {fullFile && <p>Selected: {fullFile.name}</p>}

      <label>🖼️ Cover Art</label>
      <input type="file" accept="image/*" onChange={handleFileChange(setCoverFile)} className="mb-4" />
      {coverFile && <p>Selected: {coverFile.name}</p>}

      <button
        onClick={uploadAndMint}
        disabled={uploading || writePending || receiptLoading}
        className="w-full p-2 border rounded disabled:opacity-50"
      >
        {uploading ? 'Uploading...' : writePending ? 'Awaiting Wallet...' : 'Upload & Mint'}
      </button>

      {txHash && (
        <p className="mt-3">
          TX Hash:{' '}
          <a href={`https://explorer.monad.xyz/tx/${txHash}`} target="_blank" rel="noopener noreferrer">
            {txHash}
          </a>
        </p>
      )}
    </div>
  );
}
