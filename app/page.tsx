'use client';

import { useEffect, useState } from 'react';
import { createPublicClient, http, parseAbiItem } from 'viem';
import { useAccount } from 'wagmi';
import { monadTestnet } from './chains';
import MusicNFT from '../lib/abis/MusicNFT.json';

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

export default function Home() {
  const { address } = useAccount();
  const [nfts, setNfts] = useState<NFT[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchNFTs() {
      if (!address) return;
      setLoading(true);
      try {
        // Fetch Transfer events to/from the connected address
        const transferLogs = await publicClient.getLogs({
          address: process.env.MUSICNFT_ADDRESS as `0x${string}`,
          event: parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'),
          args: { to: address },
          fromBlock: BigInt(0),
        });

        const nftList: NFT[] = [];
        // Process each Transfer event to get token IDs
        for (const log of transferLogs) {
          const tokenId = Number(log.args.tokenId);
          // Verify the token still exists and is owned by the address
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
              }) as string,
              publicClient.readContract({
                address: process.env.MUSICNFT_ADDRESS as `0x${string}`,
                abi: MusicNFT,
                functionName: 'getExpiry',
                args: [BigInt(tokenId)],
              }) as bigint,
              publicClient.readContract({
                address: process.env.MUSICNFT_ADDRESS as `0x${string}`,
                abi: MusicNFT,
                functionName: 'resalePrice',
                args: [BigInt(tokenId)],
              }) as bigint,
            ]);

            nftList.push({
              tokenId,
              coverArt,
              expiry: Number(expiry),
              resalePrice,
            });
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
  }, [address]);

  return (
    <div>
      <h1>EmpowerTours Music NFTs</h1>
      {loading ? (
        <p>Loading NFTs...</p>
      ) : (
        <div>
          <h2>Your Music NFTs</h2>
          {nfts.length === 0 ? (
            <p>No NFTs found.</p>
          ) : (
            <ul>
              {nfts.map((nft) => (
                <li key={nft.tokenId}>
                  <p>Token ID: {nft.tokenId}</p>
                  <img src={nft.coverArt} alt="NFT Cover Art" style={{ maxWidth: '200px' }} />
                  <p>Expiry: {new Date(nft.expiry * 1000).toLocaleDateString()}</p>
                  <p>Resale Price: {nft.resalePrice > 0 ? `${nft.resalePrice} Wei` : 'Not listed'}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
