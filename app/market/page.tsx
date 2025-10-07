'use client';
import React, { useState, useEffect } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { ethers } from 'ethers';
import ItineraryMarketABI from '@/lib/abis/ItineraryMarket.json';
import ToursABI from '@/lib/abis/TOURS.json';
import PassportNFTABI from '@/lib/abis/PassportNFT.json';

const ITINERARY_MARKET_ADDRESS = process.env.NEXT_PUBLIC_ITINERARY_MARKET as `0x${string}`;
const TOURS_ADDRESS = process.env.NEXT_PUBLIC_TOURS as `0x${string}`;
const PASSPORT_NFT_ADDRESS = process.env.NEXT_PUBLIC_PASSPORT as `0x${string}`;
const ESCROW_VAULT_ADDRESS = process.env.NEXT_PUBLIC_ESCROW_VAULT as `0x${string}`;

interface Itinerary {
  id: bigint;
  creator: string;
  description: string;
  price: bigint;
  isActive: boolean;
}

export default function MarketPage() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [itineraryContract, setItineraryContract] = useState<ethers.Contract | null>(null);
  const [toursContract, setToursContract] = useState<ethers.Contract | null>(null);
  const [passportContract, setPassportContract] = useState<ethers.Contract | null>(null);
  const [itineraries, setItineraries] = useState<Itinerary[]>([]);
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [ownedPassports, setOwnedPassports] = useState<any[]>([]);
  const [processingPrompt, setProcessingPrompt] = useState(false);

  useEffect(() => {
    const init = async () => {
      if (walletClient && address && ethers.utils.isAddress(address)) {
        try {
          const provider = new ethers.providers.JsonRpcProvider(process.env.NEXT_PUBLIC_MONAD_RPC);
          const signer = await provider.getSigner(address);
          const itineraryContract = new ethers.Contract(ITINERARY_MARKET_ADDRESS, ItineraryMarketABI as any, signer);
          const toursContract = new ethers.Contract(TOURS_ADDRESS, ToursABI as any, signer);
          const passportContract = new ethers.Contract(PASSPORT_NFT_ADDRESS, PassportNFTABI as any, signer);
          setItineraryContract(itineraryContract);
          setToursContract(toursContract);
          setPassportContract(passportContract);
          await fetchOwnedPassports(passportContract, address);
          await fetchItineraries(itineraryContract);
        } catch (error) {
          console.error('Failed to set up contracts:', error);
        }
      }
    };
    init();
  }, [walletClient, address]);

  const fetchItineraries = async (contract: ethers.Contract) => {
    try {
      const itineraries = await contract.getAvailableItineraries();
      setItineraries(itineraries.map((it: any) => ({
        id: it.id,
        creator: it.creator,
        description: it.description,
        price: it.price,
        isActive: it.isActive,
      })));
    } catch (error) {
      console.error('Error fetching itineraries:', error);
    }
  };

  const fetchOwnedPassports = async (contract: ethers.Contract, userAddress: string) => {
    try {
      const balance = await contract.balanceOf(userAddress);
      const passportList: any[] = [];
      for (let i = 0; i < Number(balance); i++) {
        const tokenId = await contract.tokenOfOwnerByIndex(userAddress, i);
        const tokenURI = await contract.tokenURI(tokenId);
        const metadataResponse = await fetch(tokenURI.replace('ipfs://', `https://${process.env.PINATA_GATEWAY}/ipfs/`));
        const metadata = await metadataResponse.json();
        passportList.push({
          id: tokenId.toString(),
          name: metadata.name || `Passport #${tokenId}`,
          image: metadata.image,
        });
      }
      setOwnedPassports(passportList);
    } catch (error) {
      console.error('Error fetching owned passports:', error);
    }
  };

  const approveTokens = async (amount: string) => {
    if (!toursContract) return;
    try {
      const tx = await toursContract.approve(ESCROW_VAULT_ADDRESS, ethers.utils.parseEther(amount));
      await tx.wait();
      alert('Tokens approved for spending!');
    } catch (error) {
      console.error('Error approving tokens:', error);
      alert('Failed to approve tokens');
    }
  };

  const createItinerary = async () => {
    if (!itineraryContract || !description || !price) return;
    try {
      const tx = await itineraryContract.createItinerary(description, ethers.utils.parseEther(price));
      await tx.wait();
      alert('Itinerary created!');
      setDescription('');
      setPrice('');
      await fetchItineraries(itineraryContract);
    } catch (error) {
      console.error('Error creating itinerary:', error);
      alert('Failed to create itinerary');
    }
  };

  const purchaseItinerary = async (id: number, price: bigint) => {
    if (!itineraryContract || !toursContract) return;
    try {
      await approveTokens(ethers.utils.formatEther(price));
      const tx = await itineraryContract.purchaseItinerary(id);
      await tx.wait();
      alert('Itinerary purchased!');
      await fetchItineraries(itineraryContract);
      if (passportContract && address) {
        await fetchOwnedPassports(passportContract, address);
      }
    } catch (error) {
      console.error('Error purchasing itinerary:', error);
      alert('Failed to purchase itinerary');
    }
  };

  return (
    <div className="flex flex-col items-center p-6 space-y-6">
      <h1 className="text-3xl font-bold">EmpowerTours Market</h1>
      <div className="w-full max-w-md space-y-2">
        <input
          type="text"
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full p-2 border rounded-lg"
        />
        <input
          type="text"
          placeholder="Price (TOURS)"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="w-full p-2 border rounded-lg"
        />
        <button
          onClick={createItinerary}
          disabled={!isConnected}
          className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-lg shadow"
        >
          Create Itinerary
        </button>
      </div>
      {ownedPassports.length > 0 && (
        <div className="w-full max-w-2xl">
          <h2 className="text-2xl font-semibold mt-6 mb-2">Your Passports</h2>
          <div className="grid grid-cols-2 gap-4">
            {ownedPassports.map((p, i) => (
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
      <div className="w-full max-w-2xl">
        <h2 className="text-2xl font-semibold mt-6 mb-2">Available Itineraries</h2>
        <div className="space-y-4">
          {itineraries.map((itinerary, i) => (
            <div
              key={i}
              className="p-4 border rounded-lg shadow-sm"
            >
              <p className="font-medium">ID: {itinerary.id.toString()}</p>
              <p>Creator: {itinerary.creator}</p>
              <p>Description: {itinerary.description}</p>
              <p>Price: {ethers.utils.formatEther(itinerary.price)} TOURS</p>
              <p>Status: {itinerary.isActive ? 'Active' : 'Inactive'}</p>
              {itinerary.isActive && (
                <button
                  onClick={() => purchaseItinerary(Number(itinerary.id), itinerary.price)}
                  disabled={!isConnected}
                  className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
                >
                  Purchase
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      <nav className="w-full max-w-2xl flex justify-around">
        <button onClick={() => router.push('/passport')} className="text-blue-500">Passport</button>
        <button onClick={() => router.push('/music')} className="text-blue-500">Music</button>
        <button onClick={() => router.push('/market')} className="text-blue-500">Market</button>
        <button onClick(() => router.push('/profile')} className="text-blue-500">Profile</button>
      </nav>
    </div>
  );
}
