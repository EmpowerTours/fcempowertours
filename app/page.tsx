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
      <div className="fixed top-0 left-0 w-full h-full bg-[#353B48] flex items-center justify-center z-[9999]">
        <Image src="/images/splash.png" alt="Splash" width={800} height={800} className="max-w-[80%] max-h-[80%] object-contain" />
      </div>
    );
  }
  if (!isConnected) {
    return (
      <div className="min-h-screen bg-background p-4 text-center">
        <h1 className="text-2xl font-bold mb-4">Welcome to EmpowerTours</h1>
        <p className="text-lg mb-4">Please connect your wallet to view your Music NFTs.</p>
        {/* Add connect button if needed */}
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-background p-4 text-center">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">EmpowerTours Music NFTs</h1>
        {address && <p className="text-sm text-muted-foreground">Connected: {address.slice(0,6)}...{address.slice(-4)}</p>}
      </header>
      {loading ? (
        <p className="text-lg text-muted-foreground">Loading NFTs...</p>
      ) : (
        <div>
          <h2 className="text-xl font-bold mb-4">Your Music NFTs</h2>
          {nfts.length === 0 ? (
            <div>
              <p className="text-lg text-muted-foreground mb-4">No NFTs found. Mint some!</p>
              <button onClick={() => router.push('/music')} className="bg-primary text-primary-foreground px-4 py-2 rounded">Mint Music NFT</button>
            </div>
          ) : (
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-4 list-none p-0">
              {nfts.map((nft) => (
                <li key={nft.tokenId} className="bg-card p-4 rounded shadow">
                  <p className="font-bold">Token ID: {nft.tokenId}</p>
                  <Image
                    src={nft.coverArt}
                    alt="NFT Cover Art"
                    width={200}
                    height={200}
                    className="mx-auto rounded mb-2"
                  />
                  <p>Expiry: {new Date(nft.expiry * 1000).toLocaleDateString()}</p>
                  <p>Resale Price: {nft.resalePrice > BigInt(0) ? `${nft.resalePrice} Wei` : 'Not listed'}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <footer className="mt-8 text-sm text-muted-foreground">
        <a href="/market" className="mx-2">Market</a> | <a href="/passport" className="mx-2">Passport</a> | <a href="/music" className="mx-2">Music</a>
      </footer>
    </div>
  );
}
