'use client';
import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { createPublicClient, http, parseAbiItem } from 'viem';
import { useAccount, useReadContract } from 'wagmi';
import { useRouter } from 'next/navigation';
import { monadTestnet } from './chains';
import MusicNFT from '../lib/abis/MusicNFT.json';
import PassportNFTABI from '../lib/abis/PassportNFT.json';
import { sdk } from '@farcaster/miniapp-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

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
  const [showSplash, setShowSplash] = useState(true);
  const [casts, setCasts] = useState<any[]>([]);
  const [currentCastIndex, setCurrentCastIndex] = useState(0);
  const [prompt, setPrompt] = useState('');
  const [processingPrompt, setProcessingPrompt] = useState(false);
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isLoadingNFTs, setIsLoadingNFTs] = useState(false);
  const [isLoadingCasts, setIsLoadingCasts] = useState(false);

  // All hooks first (unconditional, including useReadContract)
  const { data: passportBalance } = useReadContract({
    address: PASSPORT_NFT_ADDRESS,
    abi: PassportNFTABI,
    functionName: 'balanceOf',
    args: [address],
    query: { enabled: !!address && isConnected },
  });

  // Hydration guard
  useEffect(() => setIsMounted(true), []);

  // Splash timer
  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  // Fetch Music NFTs (guarded)
  useEffect(() => {
    async function fetchNFTs() {
      if (!address || !isConnected) return;
      setIsLoadingNFTs(true);
      try {
        const latestBlock = await publicClient.getBlockNumber();
        const fromBlock = latestBlock - BigInt(100);
        const transferLogs = await publicClient.getLogs({
          address: process.env.MUSICNFT_ADDRESS as `0x${string}`,
          event: parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'),
          args: { to: address },
          fromBlock: fromBlock > 0 ? fromBlock : BigInt(0),
          toBlock: latestBlock,
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
        setIsLoadingNFTs(false);
      }
    }
    fetchNFTs();
  }, [address, isConnected]);

  // Fetch Farcaster casts via API (guarded)
  useEffect(() => {
    const fetchCasts = async () => {
      if (!isConnected || !address) {
        setCasts([
          {
            author: { username: 'empowertours' },
            text: '🌍 Connect your wallet to see community casts!',
          },
        ]);
        return;
      }
      setIsLoadingCasts(true);
      try {
        const res = await fetch('/api/recent-casts');
        if (!res.ok) {
          console.error(`API fetch failed: status ${res.status}`);
          setCasts([
            {
              author: { username: 'empowertours' },
              text: '🌍 Unable to load casts. Please try again later.',
            },
          ]);
          return;
        }
        const { casts: dataCasts } = await res.json();
        const relevantCasts = dataCasts?.filter((cast: any) =>
          String(cast.text || '').toLowerCase().includes('empowertours') ||
          String(cast.text || '').toLowerCase().includes('itinerary') ||
          String(cast.text || '').toLowerCase().includes('music') ||
          String(cast.text || '').toLowerCase().includes('nft') ||
          String(cast.text || '').toLowerCase().includes('passport')
        ) || [];
        setCasts(relevantCasts.length > 0 ? relevantCasts : dataCasts || []);
      } catch (error) {
        console.error('Failed to fetch casts:', error);
        setCasts([
          {
            author: { username: 'empowertours' },
            text: '🌍 Unable to load casts. Please try again later.',
          },
        ]);
      } finally {
        setIsLoadingCasts(false);
      }
    };
    fetchCasts();
  }, [isConnected, address]);

  // Rotate casts (with bounds check)
  useEffect(() => {
    if (!casts || casts.length === 0) {
      setCurrentCastIndex(0);
      return;
    }
    const safeIndex = currentCastIndex % casts.length;
    setCurrentCastIndex(safeIndex);
    const interval = setInterval(() => {
      setCurrentCastIndex((prev) => (prev + 1) % casts.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [casts, currentCastIndex]);

  if (!isMounted) return <div>Loading...</div>;

  // AI Prompt handler (with Bot Integration)
  const handlePromptSubmit = async () => {
    if (!prompt.trim()) return;
    setProcessingPrompt(true);
    try {
      const lowerPrompt = prompt.toLowerCase();
      if (lowerPrompt.includes('nft') || lowerPrompt.includes('music')) {
        router.push('/music');
        return;
      } else if (lowerPrompt.includes('passport')) {
        router.push('/passport');
        return;
      } else if (lowerPrompt.includes('market') || lowerPrompt.includes('itinerary')) {
        router.push('/market');
        return;
      } else if (lowerPrompt.includes('profile')) {
        router.push('/profile');
        return;
      } else if (lowerPrompt.includes('admin')) {
        router.push('/admin');
        return;
      } else if (lowerPrompt.includes('pay') || lowerPrompt.includes('buy') || lowerPrompt.includes('transaction')) {
        if (!address || !isConnected) {
          alert('Please connect your wallet to create a transaction.');
          return;
        }
        const frameRes = await fetch('/api/farcaster/create-frame', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            address,
            fid: (await sdk.context)?.user?.fid?.toString() || '1',
          }),
        });
        if (!frameRes.ok) throw new Error(`Failed to create transaction Frame: ${frameRes.statusText}`);
        const { frameUrl: createdFrameUrl } = await frameRes.json();
        setFrameUrl(createdFrameUrl);
        alert(`Transaction Frame created! Cast it on Warpcast: ${String(createdFrameUrl)}`);
        return;
      } else if (lowerPrompt.includes('swap') || lowerPrompt.includes('buy') || lowerPrompt.includes('mint')) {
        if (!address || !isConnected) {
          alert('Connect wallet for transactions.');
          return;
        }
        const context = await sdk.context;
        const fid = context?.user?.fid || 1;
        const mockCast = { fid, text: prompt, hash: 'mock-' + Date.now(), replies: { to_fid: Number(process.env.BOT_FID) } };
        const botRes = await fetch('/api/webhooks/farcaster', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: mockCast }),
        });
        if (botRes.ok) {
          const { txHash } = await botRes.json();
          alert(`Bot executed: ${prompt}! Tx: ${String(txHash)} (Cast posted)`);
        } else {
          alert('Bot error; fallback to manual.');
        }
        return;
      }
      if (!process.env.GEMINI_API_KEY) {
        console.error('Gemini API key is not defined');
        alert('Command processing unavailable. Try basic commands like "take me to nft" or "go to profile".');
        return;
      }
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const aiPrompt = `
        Analyze this user command for an EmpowerTours app: "${prompt}".
        Output JSON ONLY, no extra text:
        {
          "actions": [{ "type": "navigate", "path": "/music" | "/passport" | "/market" | "/profile" | "none" }],
          "reason": "Brief explanation"
        }
      `;
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: aiPrompt }] }],
        generationConfig: { maxOutputTokens: 256 },
      });
      let actions: { type: string; path: string }[] = [];
      try {
        const rawText = result.response.text().trim();
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const responseJson = JSON.parse(jsonMatch[0]);
          actions = responseJson.actions || [];
        }
      } catch (err) {
        console.warn('Failed to parse Gemini response as JSON:', err);
      }
      if (actions.length > 0 && actions[0].path !== 'none') {
        actions.forEach((action) => {
          if (action.type === 'navigate') router.push(action.path);
        });
      } else {
        alert('Sorry, I didn\'t understand. Try "take me to nft", "go to passport", or "go to profile".');
      }
    } catch (error) {
      console.error('Prompt processing failed:', error);
      alert(`Error processing command: ${String((error as Error).message)}. Try basic commands like "take me to nft".`);
    } finally {
      setProcessingPrompt(false);
      setPrompt('');
    }
  };

  if (showSplash) {
    return (
      <div className="fixed top-0 left-0 w-full h-full flex items-center justify-center z-[9999]">
        <Image src="/images/splash.png" alt="Splash" width={800} height={800} className="max-w-[80%] max-h-[80%] object-contain" priority />
      </div>
    );
  }

  if (!isMounted) return <div>Loading...</div>;

  if (!isConnected) {
    return (
      <div className="min-h-screen p-4 text-center">
        <h1 className="text-2xl font-bold mb-4">Welcome to EmpowerTours</h1>
        <p className="text-lg mb-4">Please connect your wallet to view your Music NFTs.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="w-full max-w-2xl p-4">
        <div className="flex space-x-2">
          <input
            type="text"
            placeholder="Type command e.g., 'take me to nft' or 'take me to profile'"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handlePromptSubmit()}
            className="w-full p-2 border rounded"
            disabled={processingPrompt}
          />
          <button
            onClick={handlePromptSubmit}
            disabled={processingPrompt}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {processingPrompt ? 'Processing...' : 'Send'}
          </button>
        </div>
        {frameUrl && (
          <p className="mt-2">
            Transaction Frame: <a href={frameUrl} target="_blank" rel="noopener noreferrer">{String(frameUrl)}</a>
          </p>
        )}
        {isLoadingNFTs && (
          <p className="mt-2 text-gray-500">Loading your Music NFTs...</p>
        )}
        {nfts.length > 0 && (
          <div className="mt-4">
            <h2 className="text-lg font-bold mb-2">Your Music NFTs</h2>
            <div className="grid grid-cols-2 gap-4">
              {nfts.map((nft) => (
                <div key={nft.tokenId} className="border rounded-lg p-3 shadow bg-gray-50 flex flex-col items-center">
                  <img
                    src={String(nft.coverArt)}
                    alt={`NFT ${nft.tokenId}`}
                    className="rounded-lg w-24 h-24 object-cover mb-2"
                  />
                  <p className="font-medium text-sm">NFT #{nft.tokenId}</p>
                  <p className="text-sm">Expires: {new Date(nft.expiry * 1000).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="flex-1 max-h-[50vh] overflow-hidden border-b border-gray-300 mb-4">
        {isLoadingCasts ? (
          <p className="text-center text-gray-500">Loading recent casts...</p>
        ) : casts && casts.length > 0 && currentCastIndex < casts.length ? (
          <div className="p-4 rounded">
            <h2 className="text-lg font-bold mb-2">Recent Cast</h2>
            <p>{String(casts[currentCastIndex]?.text || 'No text')}</p>
            <p className="text-sm cast-username">By: {String(casts[currentCastIndex]?.author?.username || 'Unknown')}</p>
          </div>
        ) : (
          <p className="text-center">No casts available.</p>
        )}
      </div>
    </div>
  );
}
