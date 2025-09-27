"use client";
import React, { useCallback } from "react";
import { useAccount, useConnect, useWriteContract, usePublicClient } from "wagmi";
import { parseEther } from "viem";
import MusicNFT from "../../lib/abis/MusicNFT.json";
import { useMusic } from './MusicContext';
import { useAudio } from './AudioContext';
export default function WagmiWrapper({ children }) {
  const { shortSong, fullSongIPFS, coverArtIPFS, setStatus, setPlaylist, tokenId } = useMusic();  // Removed unused setTokenId
  const { setCurrentTrack, setIsPlaying } = useAudio();
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { writeContract } = useWriteContract();
  const publicClient = usePublicClient();
  const createTokenURI = useCallback(() => {
    return `data:application/json;base64,${btoa(JSON.stringify({
      name: 'Sample Song',
      description: 'A song with preview',
      image: coverArtIPFS,
      animation_url: fullSongIPFS,
      attributes: [{ trait_type: 'Preview Length', value: '3 seconds' }],
    }))}`;
  }, [coverArtIPFS, fullSongIPFS]);
  const mintMusicNFT = async () => {
    if (!shortSong || !fullSongIPFS || !coverArtIPFS) return alert('Missing fields');
    if (!isConnected) return alert('Connect wallet first');
    setStatus('Minting NFT...');
    try {
      const tokenURI = createTokenURI();
      // no hooks here
      const previewBytes = new Uint8Array(
        Array.from(atob(shortSong)).map(c => c.charCodeAt(0))
      );
      const txHash = await writeContract({
        address: '0x41eA7CfDcD27639Ab15D0F24ca1ef12aD2Ffe9d2',
        abi: MusicNFT,
        functionName: 'mint',
        args: [address, tokenURI, previewBytes, coverArtIPFS, address],
        value: parseEther('0'),
      });
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      setStatus('NFT Minted!');
      alert('Music NFT minted!');
    } catch (err) {
      console.error(err);
      setStatus('Mint failed');
    }
  };
  const fetchPreview = async () => {
    if (!tokenId) return;
    setStatus('Fetching preview...');
    try {
      const previewData = await publicClient.readContract({
        address: '0x41eA7CfDcD27639Ab15D0F24ca1ef12aD2Ffe9d2',
        abi: MusicNFT.abi,
        functionName: 'getPreview',
        args: [tokenId],
      });
      const raw = Array.from(previewData).map(b => String.fromCharCode(b)).join('');
      const previewUrl = `data:audio/ogg;base64,${btoa(raw)}`;
      setPlaylist(prev => [...prev, { name: `Preview ${tokenId}`, url: previewUrl }]);
      setCurrentTrack({ name: `Preview ${tokenId}`, url: previewUrl });
      setIsPlaying(true);
      setStatus('Preview fetched!');
    } catch (err) {
      console.error(err);
      setStatus('Fetch failed');
    }
  };
  return (
    <>
      {!isConnected ? (
        <button onClick={() => connect({ connector: connectors[0] })}>
          Connect Wallet
        </button>
      ) : (
        <p>Connected: {address}</p>
      )}
      <button onClick={mintMusicNFT}>Mint Music NFT</button>
      <button onClick={fetchPreview}>Fetch Preview</button>
      {children}
    </>
  );
}
