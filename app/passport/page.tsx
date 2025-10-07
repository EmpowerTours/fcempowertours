'use client';
import React, { useState, useEffect } from 'react';
import { useAccount, useConnect, useSwitchChain, useWriteContract } from 'wagmi';
import { createPublicClient, http, isAddress } from 'viem';
import PassportNFT from '@/lib/abis/PassportNFT.json';
import { countryData } from '@/lib/countries';
import { monadTestnet } from '../chains';
import { useRouter } from 'next/navigation';

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(process.env.NEXT_PUBLIC_MONAD_RPC),
});
const PASSPORT_NFT_ADDRESS = '0x92D5a2b741b411988468549a5f117174A1aC8D7b' as `0x${string}`;

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

  // Fetch Farcaster casts for @empowertoursbot
  useEffect(() => {
    const fetchCasts = async () => {
      setLoadingCasts(true);
      try {
        if (!process.env.NEXT_PUBLIC_NEYNAR_API_KEY) {
          throw new Error('Neynar API key is not defined');
        }
        const res = await fetch('https://api.neynar.com/v2/farcaster/casts?fid=1368808&limit=10', {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.NEXT_PUBLIC_NEYNAR_API_KEY!,
          },
        });
        if (!res.ok) throw new Error(`Neynar fetch failed: ${res.statusText}`);
        const data = await res.json();
        if (data?.result?.casts?.length) {
          setCasts(data.result.casts);
        } else {
          setCasts([
            {
              author: { username: 'empowertoursbot' },
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
            author: { username: 'empowertoursbot' },
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
        const metadataResponse = await fetch(tokenURI.replace('ipfs://', `https://${process.env.PINATA_GATEWAY}/ipfs/`));
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

  useEffect(() => {
    if (isConnected && address && isAddress(address)) fetchPassports();
  }, [isConnected, address]);

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
      await writeContractAsync({
        address: PASSPORT_NFT_ADDRESS,
        abi: PassportNFT,
        functionName: 'mint',
        args: [selectedCountry],
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

  const handlePromptSubmit = async () => {
    if (!command.trim()) return;
    setProcessingPrompt(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
      });
      const { results, reason } = await res.json();
      if (!res.ok) {
        throw new Error(`Agent API error: ${results?.error || "Unknown error"}`);
      }

      for (const result of results) {
        if (result.type === "navigate") {
          router.push(result.path);
        } else if (result.type === "mint_passport") {
          setSelectedCountry(result.params.country);
          await handleMint();
        } else if (result.type === "create_pay_frame") {
          alert("✅ Transaction frame created and cast shared!");
        } else if (result.type === "post_cast") {
          alert("✅ Cast posted!");
        }
      }
      if (!results.some((r: any) => r.type === "navigate")) {
        alert(`Action processed: ${reason}`);
      }
    } catch (error) {
      console.error("Prompt processing failed:", {
        message: (error as Error).message,
        stack: (error as Error).stack,
      });
      alert(`Error: ${(error as Error).message}. Try commands like "book a trip to Japan" or "mint passport for France".`);
    } finally {
      setProcessingPrompt(false);
      setCommand("");
    }
  };

  return (
    <div className="flex flex-col items-center p-6 space-y-6">
      <h1 className="text-3xl font-bold">EmpowerTours Passport</h1>
      <div className="w-full max-w-md space-y-2">
        <label className="block text-sm font-medium">Select your country:</label>
        <select
          value={selectedCountry}
          onChange={(e) => setSelectedCountry(e.target.value)}
          className="w-full border rounded-lg p-2"
        >
          <option value="">-- Choose a country --</option>
          {Object.entries(countryData).map(([code, { name }]) => (
            <option key={code} value={code}>{name}</option>
          ))}
        </select>
        <button
          onClick={handleMint}
          className="w-full hover:bg-purple-700 font-semibold py-2 px-4 rounded-lg shadow"
        >
          Mint One
        </button>
      </div>
      {passports.length > 0 && (
        <div className="w-full max-w-2xl">
          <h2 className="text-2xl font-semibold mt-6 mb-2">Your Passports</h2>
          <div className="grid grid-cols-2 gap-4">
            {passports.map((p, i) => (
              <div
                key={i}
                className="border rounded-lg p-3 shadow flex flex-col items-center"
              >
                {p.image && (
                  <img
                    src={p.image.replace('ipfs://', `https://${process.env.PINATA_GATEWAY}/ipfs/`)}
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
      <nav className="w-full max-w-2xl flex justify-around">
        <button onClick={() => router.push('/passport')} className="text-blue-500">Passport</button>
        <button onClick={() => router.push('/music')} className="text-blue-500">Music</button>
        <button onClick={() => router.push('/market')} className="text-blue-500">Market</button>
        <button onClick={() => router.push('/profile')} className="text-blue-500">Profile</button>
      </nav>
      <div className="w-full max-w-2xl mt-4">
        <div className="flex space-x-2">
          <input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handlePromptSubmit()}
            placeholder="Type command e.g., 'book a trip to Japan' or 'mint passport for France'"
            className="w-full p-2 border rounded-lg"
            disabled={processingPrompt}
          />
          <button
            onClick={handlePromptSubmit}
            disabled={processingPrompt}
            className="px-4 py-2 rounded"
          >
            {processingPrompt ? 'Processing...' : 'Send'}
          </button>
        </div>
      </div>
      <div className="w-full max-w-2xl mt-8">
        <h2 className="text-2xl font-semibold mb-4">Community Feed</h2>
        {loadingCasts ? (
          <p>Loading casts…</p>
        ) : (
          <div className="space-y-4">
            {casts.map((cast: any, i: number) => (
              <div
                key={i}
                className="p-4 border rounded-lg shadow-sm"
              >
                <p className="font-medium cast-username">{cast.author?.username}</p>
                <p>{cast.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
