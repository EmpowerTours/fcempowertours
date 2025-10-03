'use client';
import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { createPublicClient, http, parseAbiItem } from 'viem';
import { useAccount, useReadContract } from 'wagmi';
import { useRouter } from 'next/navigation';
import { monadTestnet } from './chains';
import MusicNFT from '../lib/abis/MusicNFT.json';
import PassportNFTABI from '../lib/abis/PassportNFT.json'; // Add for passport balance check
const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(process.env.NEXT_PUBLIC_MONAD_RPC),
});
interface NFT {
  tokenId: number;
  coverArt: string;
  expiry: number;
  resalePrice: bigint;
}
const PASSPORT_NFT_ADDRESS = '0x92d5a2b741b411988468549a5f117174a1ac8d7b' as `0x${string}`;
export default function Home() {
  const { address, isConnected } = useAccount();
  const router = useRouter();
  const [nfts, setNfts] = useState<NFT[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSplash, setShowSplash] = useState(true); // Custom splash
  // Passport balance for redirect
  const { data: passportBalance } = useReadContract({
    address: PASSPORT_NFT_ADDRESS,
    abi: PassportNFTABI, // Remove 'as any' - assuming PassportNFTABI is properly typed as Abi
    functionName: 'balanceOf',
    args: [address],
    query: { enabled: !!address && isConnected },
  });
  // Custom splash timer
  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 2000);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    async function fetchNFTs() {
      if (!address || !isConnected) return;
      setLoading(true);
      try {
        const transferLogs = await publicClient.getLogs({
          address: process.env.MUSICNFT_ADDRESS as `0x${string}`,
          event: parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'),
          args: { to: address },
          fromBlock: BigInt(0),
        });
        const nftList: NFT[] = [];
        for (const log of transferLogs) {
          const tokenId = Number(log.args.tokenId);
          try {
            const owner = await publicClient.readContract({
              address: process.env.MUSICNFT_ADDRESS as `0x${string}`,
              abi: MusicNFT,
              functionName: 'ownerOf',
              args: [BigInt(tokenId)],
            }) as `0x${string}`;
            if (owner.toLowerCase() === address.toLowerCase()) {
              const [coverArt, expiry, resalePrice] = await Promise.all([
                publicClient.readContract({
                  address: process.env.MUSICNFT_ADDRESS as `0x${string}`,
                  abi: MusicNFT,
                  functionName: 'getCoverArt',
                  args: [BigInt(tokenId)],
                }) as Promise<string>,
                publicClient.readContract({
                  address: process.env.MUSICNFT_ADDRESS as `0x${string}`,
                  abi: MusicNFT,
                  functionName: 'getExpiry',
                  args: [BigInt(tokenId)],
                }) as Promise<bigint>,
                publicClient.readContract({
                  address: process.env.MUSICNFT_ADDRESS as `0x${string}`,
                  abi: MusicNFT,
                  functionName: 'resalePrice',
                  args: [BigInt(tokenId)],
                }) as Promise<bigint>,
              ]);
              nftList.push({
                tokenId,
                coverArt,
                expiry: Number(expiry),
                resalePrice,
              });
            }
          } catch (error) {
            console.error(`Error processing tokenId ${tokenId}:`, error);
          }
        }
        setNfts(nftList);
      } catch (error) {
        console.error('Error fetching Music NFTs:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchNFTs();
  }, [address, isConnected]);
  // Auto-redirect based on passport/NFTs
  useEffect(() => {
    if (isConnected && passportBalance !== undefined) {
      if ((passportBalance as bigint) === BigInt(0)) {
        router.push('/passport'); // Mint passport if none
      } else if (nfts.length === 0) {
        router.push('/music'); // Mint music if none
      } else {
        router.push('/market'); // To market if all set
      }
    }
  }, [isConnected, passportBalance, nfts, router]);
  if (showSplash) {
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: '#353B48', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
        <Image src="/images/splash.png" alt="Splash" width={800} height={800} style={{ maxWidth: '80%', maxHeight: '80%', objectFit: 'contain' }} />
      </div>
    );
  }
  return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px' }}>EmpowerTours Music NFTs</h1>
      {loading ? (
        <p style={{ fontSize: '16px', color: '#666' }}>Loading NFTs...</p>
      ) : (
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '15px' }}>Your Music NFTs</h2>
          {nfts.length === 0 ? (
            <p style={{ fontSize: '16px', color: '#666' }}>No NFTs found.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {nfts.map((nft) => (
                <li key={nft.tokenId} style={{ marginBottom: '30px', borderBottom: '1px solid #eee', paddingBottom: '20px' }}>
                  <p style={{ fontWeight: 'bold' }}>Token ID: {nft.tokenId}</p>
                  <Image
                    src={nft.coverArt}
                    alt="NFT Cover Art"
                    width={200}
                    height={200}
                    style={{ maxWidth: '200px', borderRadius: '8px', margin: '10px 0' }}
                  />
                  <p>Expiry: {new Date(nft.expiry * 1000).toLocaleDateString()}</p>
                  <p>Resale Price: {nft.resalePrice > BigInt(0) ? `${nft.resalePrice} Wei` : 'Not listed'}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
