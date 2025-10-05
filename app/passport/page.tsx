'use client';
import React, { useState, useEffect } from 'react';
import { useAccount, useConnect, useSwitchChain, useWriteContract } from 'wagmi';
import { createPublicClient, http, isAddress } from 'viem';
import PassportNFT from '@/lib/abis/PassportNFT.json';
import { countryData } from '@/lib/countries';
import { monadTestnet } from '../chains';
import { useRouter } from 'next/navigation';
import { GoogleGenerativeAI } from '@google/generative-ai';

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(process.env.NEXT_PUBLIC_MONAD_RPC),
});

const PASSPORT_NFT_ADDRESS = '0x92d5a2b741b411988468549a5f117174a1ac8d7b' as `0x${string}`;

export default function PassportPage() {
  const [casts, setCasts] = useState<any[]>([]);
  const [loadingCasts, setLoadingCasts] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState('');
  const [command, setCommand] = useState('');
  const [passports, setPassports] = useState<any[]>([]);
  const [processingPrompt, setProcessingPrompt] = useState(false);
  const { address, isConnected, isConnecting, isDisconnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const router = useRouter();

  // Fetch Farcaster casts via Neynar API
  useEffect(() => {
    const fetchCasts = async () => {
      setLoadingCasts(true);
      try {
        if (!process.env.NEXT_PUBLIC_NEYNAR_API_KEY) {
          throw new Error('Neynar API key is not defined');
        }
        const res = await fetch('https://api.neynar.com/v2/farcaster/casts?fid=1&limit=10', {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_NEYNAR_API_KEY}`,
          },
        });
        if (!res.ok) throw new Error(`Neynar fetch failed: ${res.statusText}`);
        const data = await res.json();
        if (data?.result?.casts?.length) {
          setCasts(data.result.casts);
        } else {
          setCasts([
            {
              author: { username: 'empowertours' },
              text: '🌍 Mint your first EmpowerTours Passport to begin your adventure!',
            },
          ]);
        }
      } catch (err) {
        console.error('Failed to fetch casts:', {
          message: (err as Error).message,
          stack: (err as Error).stack,
        });
        setCasts([
          {
            author: { username: 'empowertours' },
            text: '🌍 Mint your first EmpowerTours Passport to begin your adventure!',
          },
        ]);
      } finally {
        setLoadingCasts(false);
      }
    };
    fetchCasts();
  }, []);

  // Fetch user's minted passports
  const fetchPassports = async () => {
    if (!address || !isAddress(address)) {
      console.error('Invalid or missing address for fetching passports:', { address, isConnected });
      return;
    }
    try {
      const balance = await publicClient.readContract({
        address: PASSPORT_NFT_ADDRESS,
        abi: PassportNFT,
        functionName: 'balanceOf',
        args: [address],
      }) as bigint;
      const passportList: any[] = [];
      for (let i = 0; i < Number(balance); i++) {
        const tokenId = await publicClient.readContract({
          address: PASSPORT_NFT_ADDRESS,
          abi: PassportNFT,
          functionName: 'tokenOfOwnerByIndex',
          args: [address, BigInt(i)],
        }) as bigint;
        const tokenURI = await publicClient.readContract({
          address: PASSPORT_NFT_ADDRESS,
          abi: PassportNFT,
          functionName: 'tokenURI',
          args: [tokenId],
        }) as string;
        const metadataResponse = await fetch(tokenURI.replace('ipfs://', 'https://ipfs.io/ipfs/'));
        const metadata = await metadataResponse.json();
        passportList.push({
          id: tokenId.toString(),
          name: metadata.name || `Passport #${tokenId}`,
          image: metadata.image,
        });
      }
      setPassports(passportList);
    } catch (err) {
      console.error('Error loading passports:', {
        message: (err as Error).message,
        stack: (err as Error).stack,
      });
    }
  };

  // Load passports when wallet connects
  useEffect(() => {
    if (isConnected && address && isAddress(address)) fetchPassports();
  }, [isConnected, address]);

  // Handle mint interaction with Monad wallet
  const handleMint = async () => {
    if (!selectedCountry) {
      alert('Please select a country first!');
      return;
    }
    if (!isConnected || isConnecting || isDisconnected || !address || !isAddress(address)) {
      console.error('Wallet not properly connected for minting:', { address, isConnected, isConnecting, isDisconnected });
      alert('Please connect a valid wallet address (40-character hex).');
      return;
    }
    try {
      if (!isConnected) await connect({ connector: connectors[0] });
      await switchChainAsync({ chainId: monadTestnet.id });
      console.log('Minting passport with:', {
        address,
        contractAddress: PASSPORT_NFT_ADDRESS,
        selectedCountry,
      });
      // Assuming PassportNFT mint function is: mint(address to, string country)
      await writeContractAsync({
        address: PASSPORT_NFT_ADDRESS,
        abi: PassportNFT,
        functionName: 'mint',
        args: [address, selectedCountry],
        chainId: monadTestnet.id,
        account: address,
      });
      alert(`Mint requested for ${selectedCountry}. Approve in wallet.`);
      await fetchPassports();
    } catch (err: any) {
      console.error('Mint failed:', {
        message: err.message,
        stack: err.stack,
        cause: err.cause,
        address,
        contractAddress: PASSPORT_NFT_ADDRESS,
        selectedCountry,
      });
      alert(`Mint failed: ${err.message || 'Unknown error'}. Check browser console for details.`);
    }
  };

  // Handle command prompt submission
  const handlePromptSubmit = async () => {
    if (!command.trim()) return;
    setProcessingPrompt(true);
    try {
      const lowerCommand = command.toLowerCase();
      if (lowerCommand.includes('nft') || lowerCommand.includes('music')) {
        router.push('/music');
        return;
      } else if (lowerCommand.includes('passport')) {
        router.push('/passport');
        return;
      } else if (lowerCommand.includes('market') || lowerCommand.includes('itinerary')) {
        router.push('/market');
        return;
      } else if (lowerCommand.includes('profile')) {
        router.push('/profile');
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
        Analyze this user command for an EmpowerTours app: "${command}".
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
        alert('Sorry, I didn\'t understand. Try "take me to nft", "go to passport", or "take me to profile".');
      }
    } catch (error) {
      console.error('Prompt processing failed:', {
        message: (error as Error).message,
        stack: (error as Error).stack,
      });
      alert(`Error processing command: ${(error as Error).message}. Try basic commands like "take me to nft".`);
    } finally {
      setProcessingPrompt(false);
      setCommand('');
    }
  };

  return (
    <div style={{ backgroundColor: '#f3f4f6 !important', color: '#111827 !important' }} className="flex flex-col items-center p-6 space-y-6">
      <h1 style={{ color: '#111827 !important' }} className="text-3xl font-bold">EmpowerTours Passport</h1>
      <div className="w-full max-w-md space-y-2">
        <label style={{ color: '#111827 !important' }} className="block text-sm font-medium">Select your country:</label>
        <select
          value={selectedCountry}
          onChange={(e) => setSelectedCountry(e.target.value)}
          style={{ backgroundColor: '#ffffff !important', color: '#111827 !important' }}
          className="w-full border rounded-lg p-2"
        >
          <option value="">-- Choose a country --</option>
          {Object.entries(countryData).map(([code, { name }]) => (
            <option key={code} value={code}>{name}</option>
          ))}
        </select>
        <button
          onClick={handleMint}
          style={{ backgroundColor: '#9333ea !important', color: '#ffffff !important' }}
          className="w-full hover:bg-purple-700 font-semibold py-2 px-4 rounded-lg shadow"
        >
          Mint One
        </button>
      </div>
      {passports.length > 0 && (
        <div className="w-full max-w-2xl">
          <h2 style={{ color: '#111827 !important' }} className="text-2xl font-semibold mt-6 mb-2">Your Passports</h2>
          <div className="grid grid-cols-2 gap-4">
            {passports.map((p, i) => (
              <div
                key={i}
                style={{ backgroundColor: '#f9fafb !important' }}
                className="border rounded-lg p-3 shadow flex flex-col items-center"
              >
                {p.image && (
                  <img
                    src={p.image.replace('ipfs://', 'https://ipfs.io/ipfs/')}
                    alt={p.name}
                    className="rounded-lg w-32 h-32 object-cover mb-2"
                  />
                )}
                <p style={{ color: '#111827 !important' }} className="font-medium text-sm">{p.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      <nav className="w-full max-w-2xl flex justify-around">
        <button onClick={() => router.push('/passport')} style={{ color: '#3b82f6 !important' }}>Passport</button>
        <button onClick={() => router.push('/music')} style={{ color: '#3b82f6 !important' }}>Music</button>
        <button onClick={() => router.push('/market')} style={{ color: '#3b82f6 !important' }}>Market</button>
        <button onClick={() => router.push('/profile')} style={{ color: '#3b82f6 !important' }}>Profile</button>
      </nav>
      <div className="w-full max-w-2xl mt-4">
        <div className="flex space-x-2">
          <input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handlePromptSubmit()}
            placeholder="Type command e.g., 'take me to nft' or 'take me to profile'"
            style={{ backgroundColor: '#ffffff !important', color: '#111827 !important' }}
            className="w-full p-2 border rounded-lg"
            disabled={processingPrompt}
          />
          <button
            onClick={handlePromptSubmit}
            disabled={processingPrompt}
            style={{ backgroundColor: '#2563eb !important', color: '#ffffff !important' }}
            className="px-4 py-2 rounded"
          >
            {processingPrompt ? 'Processing...' : 'Send'}
          </button>
        </div>
      </div>
      <div className="w-full max-w-2xl mt-8">
        <h2 style={{ color: '#111827 !important' }} className="text-2xl font-semibold mb-4">Community Feed</h2>
        {loadingCasts ? (
          <p style={{ color: '#111827 !important' }}>Loading casts…</p>
        ) : (
          <div className="space-y-4">
            {casts.map((cast: any, i: number) => (
              <div
                key={i}
                style={{ backgroundColor: '#f9fafb !important' }}
                className="p-4 border rounded-lg shadow-sm"
              >
                <p style={{ color: '#7e22ce !important' }} className="font-medium">{cast.author?.username}</p>
                <p style={{ color: '#111827 !important' }}>{cast.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
