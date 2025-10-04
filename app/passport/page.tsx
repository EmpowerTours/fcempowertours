'use client';
import React, { useState, useEffect } from 'react';
import { useAccount, useConnect, useSwitchChain, useWriteContract } from 'wagmi';
import { createPublicClient, http } from 'viem';
import PassportNFT from '@/lib/abis/PassportNFT.json';
import { countryData } from '@/lib/countries';
import { monadTestnet } from '../chains';
import { useRouter } from 'next/navigation';

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(process.env.NEXT_PUBLIC_MONAD_RPC),
});

export default function PassportPage() {
  const [casts, setCasts] = useState<any[]>([]);
  const [loadingCasts, setLoadingCasts] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState('');
  const [command, setCommand] = useState('');
  const [passports, setPassports] = useState<any[]>([]);
  const [processingPrompt, setProcessingPrompt] = useState(false);
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const router = useRouter();

  // Fetch Farcaster casts via Neynar API
  useEffect(() => {
    const fetchCasts = async () => {
      setLoadingCasts(true);
      try {
        const res = await fetch('https://api.neynar.com/v2/farcaster/casts?fid=1&limit=10', {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_NEYNAR_API_KEY}`,
          },
        });
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
        console.error('Failed to fetch casts:', err);
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
    if (!address) return;
    try {
      const balance = await publicClient.readContract({
        address: process.env.NEXT_PUBLIC_PASSPORTNFT_ADDRESS as `0x${string}`,
        abi: PassportNFT,
        functionName: 'balanceOf',
        args: [address],
      }) as bigint;

      const passportList: any[] = [];
      for (let i = 0; i < Number(balance); i++) {
        const tokenId = await publicClient.readContract({
          address: process.env.NEXT_PUBLIC_PASSPORTNFT_ADDRESS as `0x${string}`,
          abi: PassportNFT,
          functionName: 'tokenOfOwnerByIndex',
          args: [address, BigInt(i)],
        }) as bigint;

        const tokenURI = await publicClient.readContract({
          address: process.env.NEXT_PUBLIC_PASSPORTNFT_ADDRESS as `0x${string}`,
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
      console.error('Error loading passports:', err);
    }
  };

  // Load passports when wallet connects
  useEffect(() => {
    if (isConnected) fetchPassports();
  }, [isConnected, address]);

  // Handle mint interaction with Monad wallet
  const handleMint = async () => {
    if (!selectedCountry) {
      alert('Please select a country first!');
      return;
    }

    try {
      if (!isConnected) await connect({ connector: connectors[0] });
      await switchChainAsync({ chainId: monadTestnet.id });

      await writeContractAsync({
        address: process.env.NEXT_PUBLIC_PASSPORTNFT_ADDRESS as `0x${string}`,
        abi: PassportNFT,
        functionName: 'mint',
        args: [selectedCountry],
        chainId: monadTestnet.id,
      });

      alert(`Mint requested for ${selectedCountry}. Approve in wallet.`);
      await fetchPassports(); // Refresh user's passports
    } catch (err: any) {
      console.error('Mint failed:', {
        message: err.message,
        stack: err.stack,
        cause: err.cause,
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
      } else if (lowerCommand.includes('passport')) {
        router.push('/passport');
      } else if (lowerCommand.includes('market') || lowerCommand.includes('itinerary')) {
        router.push('/market');
      } else {
        alert('Sorry, I didn\'t understand. Try "take me to nft" or "go to passport".');
      }
      setCommand('');
    } catch (error) {
      console.error('Command processing failed:', error);
      alert('Error processing command. Try again.');
    } finally {
      setProcessingPrompt(false);
    }
  };

  return (
    <div className="flex flex-col items-center p-6 space-y-6">
      <h1 className="text-3xl font-bold">EmpowerTours Passport</h1>

      {/* Country Select */}
      <div className="w-full max-w-md space-y-2">
        <label className="block text-sm font-medium text-gray-700">Select your country:</label>
        <select
          value={selectedCountry}
          onChange={(e) => setSelectedCountry(e.target.value)}
          className="w-full border rounded-lg p-2 bg-white text-black"
        >
          <option value="">-- Choose a country --</option>
          {Object.entries(countryData).map(([code, { name }]) => (
            <option key={code} value={code}>{name}</option>
          ))}
        </select>
        <button
          onClick={handleMint}
          className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-lg shadow"
        >
          Mint One
        </button>
      </div>

      {/* User Passports */}
      {passports.length > 0 && (
        <div className="w-full max-w-2xl">
          <h2 className="text-2xl font-semibold mt-6 mb-2">Your Passports</h2>
          <div className="grid grid-cols-2 gap-4">
            {passports.map((p, i) => (
              <div
                key={i}
                className="border rounded-lg p-3 shadow bg-gray-50 flex flex-col items-center"
              >
                {p.image && (
                  <img
                    src={p.image.replace('ipfs://', 'https://ipfs.io/ipfs/')}
                    alt={p.name}
                    className="rounded-lg w-32 h-32 object-cover mb-2"
                  />
                )}
                <p className="font-medium text-sm">{p.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Navigation Links */}
      <nav className="w-full max-w-2xl flex justify-around">
        <button onClick={() => router.push('/passport')} className="text-blue-500">Passport</button>
        <button onClick={() => router.push('/music')} className="text-blue-500">Music</button>
        <button onClick={() => router.push('/market')} className="text-blue-500">Market</button>
        <button onClick={() => router.push('/profile')} className="text-blue-500">Profile</button>
      </nav>

      {/* Command Prompt */}
      <div className="w-full max-w-2xl mt-6">
        <div className="flex space-x-2">
          <input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handlePromptSubmit()}
            placeholder="Type command e.g., 'take me to nft'"
            className="w-full border p-2 rounded-lg shadow"
            disabled={processingPrompt}
          />
          <button
            onClick={handlePromptSubmit}
            disabled={processingPrompt}
            className="bg-primary text-white px-4 py-2 rounded"
          >
            {processingPrompt ? 'Processing...' : 'Send'}
          </button>
        </div>
      </div>

      {/* Cast Feed */}
      <div className="w-full max-w-2xl mt-8">
        <h2 className="text-2xl font-semibold mb-4">Community Feed</h2>
        {loadingCasts ? (
          <p>Loading casts…</p>
        ) : (
          <div className="space-y-4">
            {casts.map((cast: any, i: number) => (
              <div
                key={i}
                className="p-4 border rounded-lg bg-gray-50 shadow-sm"
              >
                <p className="font-medium text-purple-700">{cast.author?.username}</p>
                <p>{cast.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
