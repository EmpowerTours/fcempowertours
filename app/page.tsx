'use client';
import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { createPublicClient, http, parseAbiItem } from 'viem';
import { useAccount, useReadContract } from 'wagmi';
import { useRouter } from 'next/navigation';
import { monadTestnet } from './chains';
import MusicNFT from '../lib/abis/MusicNFT.json';
import PassportNFTABI from '../lib/abis/PassportNFT.json'; // Add for passport balance check
import { sdk } from '@farcaster/miniapp-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai'; // For AI prompt processing
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
  const [_nfts, setNfts] = useState<NFT[]>([]); // Prefix with _ to allow unused
  const [showSplash, setShowSplash] = useState(true); // Custom splash
  const [casts, setCasts] = useState<any[]>([]); // Farcaster casts
  const [currentCastIndex, setCurrentCastIndex] = useState(0);
  const [prompt, setPrompt] = useState('');
  const [processingPrompt, setProcessingPrompt] = useState(false);
  // Passport balance for redirect
  const { data: _passportBalance } = useReadContract({ // Prefix with _ to allow unused
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
      }
    }
    fetchNFTs();
  }, [address, isConnected]);
  // Fetch user's Farcaster casts (using Neynar API - add NEYNAR_API_KEY to env)
  useEffect(() => {
    const fetchCasts = async () => {
      if (!isConnected || !address) return;
      try {
        const context = await sdk.context;
        const fid = context?.user?.fid;
        if (!fid) return;
        const res = await fetch(`https://api.neynar.com/v2/farcaster/casts?fid=${fid}&limit=10`, {
          headers: { 'api-key': process.env.NEYNAR_API_KEY || 'YOUR_NEYNAR_API_KEY' }, // Get from neynar.com
        });
        if (!res.ok) throw new Error('Neynar fetch failed');
        const data = await res.json();
        const relevantCasts = data.casts.filter((cast: any) => 
          cast.text.toLowerCase().includes('empowertours') || 
          cast.text.toLowerCase().includes('itinerary') || 
          cast.text.toLowerCase().includes('music') ||
          cast.text.toLowerCase().includes('nft') ||
          cast.text.toLowerCase().includes('passport')
        );
        setCasts(relevantCasts.length > 0 ? relevantCasts : data.casts); // Fallback to all if no matches
      } catch (error) {
        console.error('Failed to fetch casts:', error);
      }
    };
    fetchCasts();
  }, [isConnected, address]);
  // Rotate casts every 4s
  useEffect(() => {
    if (casts.length === 0) return;
    const interval = setInterval(() => {
      setCurrentCastIndex((prev) => (prev + 1) % casts.length);
    }, 4000); // 4 seconds
    return () => clearInterval(interval);
  }, [casts]);
  // Auto-redirect based on passport/NFTs (disabled for new UI - uncomment if needed)
  /*
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
  */
  // Handle AI prompt submission with Gemini
  const handlePromptSubmit = async () => {
    if (!prompt.trim()) return;
    setProcessingPrompt(true);
    try {
      // Simple fallback string match (no API call for efficiency)
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
      }

      // Gemini for advanced/multi-action intent
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const aiPrompt = `
        Analyze this user command for an EmpowerTours app: "${prompt}".
        Output JSON: {
          "actions": [{ "type": "navigate", "path": "/music" | "/passport" | "/market" | "none" }],
          "reason": "Brief explanation"
        }
        For multi-actions, list in sequence. Use "none" if unclear.
      `;
      const result = await model.generateContent(aiPrompt, {
        generationConfig: { 
          thinkingConfig: { thinkingBudget: 0 }, // Disable for speed/efficiency
          maxOutputTokens: 256 // Limit to reduce costs
        }
      });
      const responseJson = JSON.parse(result.response.text().trim());
      
      // Execute actions (e.g., sequential navigation)
      const actions = responseJson.actions || [];
      if (actions.length > 0 && actions[0].path !== 'none') {
        actions.forEach((action: { path: string }) => {
          if (action.type === 'navigate') router.push(action.path);
        });
      } else {
        alert('Sorry, I didn\'t understand. Try "take me to nft" or "go to passport".');
      }
    } catch (error) {
      console.error('Prompt processing failed:', error);
      alert('Error processing command. Try again.');
    } finally {
      setProcessingPrompt(false);
      setPrompt('');
    }
  };
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
    <div className="min-h-screen bg-background flex flex-col">
      {/* Upper half: Rotating cast frame */}
      <div className="flex-1 max-h-[50vh] overflow-hidden border-b border-gray-300 mb-4">
        {casts.length > 0 ? (
          <div className="p-4 bg-gray-100 rounded">
            <h2 className="text-lg font-bold mb-2">Recent Cast</h2>
            <p>{casts[currentCastIndex]?.text || 'No text'}</p>
            <p className="text-sm text-gray-500">By: {casts[currentCastIndex]?.author?.username || 'Unknown'}</p>
            {/* Add media if available */}
          </div>
        ) : (
          <p className="text-center text-muted-foreground">Loading casts...</p>
        )}
      </div>
      
      {/* Lower half: AI Prompt */}
      <div className="flex-1 flex flex-col justify-end p-4">
        <div className="mb-4">
          <input
            type="text"
            placeholder="Type command e.g., 'take me to nft'"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handlePromptSubmit()}
            className="w-full p-2 border rounded"
            disabled={processingPrompt}
          />
          <button 
            onClick={handlePromptSubmit}
            disabled={processingPrompt}
            className="mt-2 bg-primary text-white px-4 py-2 rounded w-full"
          >
            {processingPrompt ? 'Processing...' : 'Send'}
          </button>
        </div>
      </div>
      
      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 flex justify-around">
        <button onClick={() => router.push('/passport')} className="text-blue-500">Passport</button>
        <button onClick={() => router.push('/music')} className="text-blue-500">Music</button>
        <button onClick={() => router.push('/market')} className="text-blue-500">Market</button>
        <button onClick={() => router.push('/profile')} className="text-blue-500">Profile</button>
      </nav>
    </div>
  );
}
