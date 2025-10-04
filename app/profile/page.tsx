'use client';
import React, { useState, useEffect } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';
import { useAccount } from 'wagmi';
import { createPublicClient, http } from 'viem';
import PassportNFT from '@/lib/abis/PassportNFT.json';
import MusicNFT from '@/lib/abis/MusicNFT.json';
import { monadTestnet } from '../chains';

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(process.env.NEXT_PUBLIC_MONAD_RPC),
});

export default function ProfilePage() {
  const [fid, setFid] = useState<string>('Not logged in');
  const [passports, setPassports] = useState<any[]>([]);
  const [musicNfts, setMusicNfts] = useState<any[]>([]);
  const { address, chain } = useAccount();

  useEffect(() => {
    async function fetchContext() {
      try {
        const context = await sdk.context;
        setFid(context.user?.fid?.toString() || 'Not logged in');
      } catch (error) {
        console.error('Error fetching context:', error);
      }
    }
    fetchContext();
  }, []);

  useEffect(() => {
    async function loadPassports() {
      if (!address) return;
      try {
        const contract = {
          address: process.env.NEXT_PUBLIC_PASSPORTNFT_ADDRESS as `0x${string}`,
          abi: PassportNFT,
        };
        const balance = await publicClient.readContract({
          ...contract,
          functionName: 'balanceOf',
          args: [address],
        }) as bigint;

        const passportsArr: any[] = [];
        for (let i = 0; i < Number(balance); i++) {
          const tokenId = await publicClient.readContract({
            ...contract,
            functionName: 'tokenOfOwnerByIndex',
            args: [address, BigInt(i)],
          }) as bigint;

          const tokenURI = await publicClient.readContract({
            ...contract,
            functionName: 'tokenURI',
            args: [tokenId],
          }) as string;

          const metadataRes = await fetch(tokenURI.replace('ipfs://', 'https://ipfs.io/ipfs/'));
          const metadata = await metadataRes.json();

          passportsArr.push({
            id: tokenId.toString(),
            name: metadata.name || `Passport #${tokenId}`,
            image: metadata.image,
          });
        }
        setPassports(passportsArr);
      } catch (err) {
        console.error('Failed to load passports:', err);
      }
    }

    async function loadMusicNfts() {
      if (!address) return;
      try {
        const contract = {
          address: process.env.MUSICNFT_ADDRESS as `0x${string}`,
          abi: MusicNFT,
        };
        const balance = await publicClient.readContract({
          ...contract,
          functionName: 'balanceOf',
          args: [address],
        }) as bigint;

        const musicNftsArr: any[] = [];
        for (let i = 0; i < Number(balance); i++) {
          const tokenId = await publicClient.readContract({
            ...contract,
            functionName: 'tokenOfOwnerByIndex',
            args: [address, BigInt(i)],
          }) as bigint;

          const tokenURI = await publicClient.readContract({
            ...contract,
            functionName: 'tokenURI',
            args: [tokenId],
          }) as string;

          const coverArt = await publicClient.readContract({
            ...contract,
            functionName: 'getCoverArt',
            args: [tokenId],
          }) as string;

          const metadataRes = await fetch(tokenURI.replace('ipfs://', 'https://ipfs.io/ipfs/'));
          const metadata = await metadataRes.json();

          musicNftsArr.push({
            id: tokenId.toString(),
            name: metadata.name || `Music NFT #${tokenId}`,
            image: coverArt,
          });
        }
        setMusicNfts(musicNftsArr);
      } catch (err) {
        console.error('Failed to load music NFTs:', err);
      }
    }

    if (address) {
      loadPassports();
      loadMusicNfts();
    }
  }, [address]);

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold">Profile</h1>
      <p className="mt-2 text-gray-700">FID: {fid}</p>
      <p className="text-gray-700">Wallet: {address || 'Not connected'}</p>
      <p className="text-gray-700">Network: {chain?.name || 'Unknown network'}</p>

      {passports.length > 0 && (
        <div className="mt-6">
          <h2 className="text-xl font-semibold">Your Passports</h2>
          <div className="grid grid-cols-2 gap-4 mt-3">
            {passports.map((p, i) => (
              <div
                key={i}
                className="border rounded-lg p-3 shadow bg-gray-50 flex flex-col items-center"
              >
                {p.image && (
                  <img
                    src={p.image.replace('ipfs://', 'https://ipfs.io/ipfs/')}
                    alt={p.name}
                    className="rounded-lg w-24 h-24 object-cover mb-2"
                  />
                )}
                <p className="font-medium text-sm">{p.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {musicNfts.length > 0 && (
        <div className="mt-6">
          <h2 className="text-xl font-semibold">Your Music NFTs</h2>
          <div className="grid grid-cols-2 gap-4 mt-3">
            {musicNfts.map((nft, i) => (
              <div
                key={i}
                className="border rounded-lg p-3 shadow bg-gray-50 flex flex-col items-center"
              >
                {nft.image && (
                  <img
                    src={nft.image}
                    alt={nft.name}
                    className="rounded-lg w-24 h-24 object-cover mb-2"
                  />
                )}
                <p className="font-medium text-sm">{nft.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
