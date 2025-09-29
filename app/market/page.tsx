'use client';

import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { createWeb3Modal, defaultWagmiConfig } from '@web3modal/wagmi/react';
import { WagmiConfig, useAccount, useWalletClient, useReadContract } from 'wagmi';
import { Abi } from 'viem';
import ItineraryMarketABI from '../../lib/abis/ItineraryMarket.json';
import ToursABI from '../../lib/abis/TOURS.json';
import PassportNFTABI from '../../lib/abis/PassportNFT.json';

// Configure Wagmi for Monad chain
const projectId = process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || 'YOUR_WALLET_CONNECT_PROJECT_ID';
const chains = [
  {
    chainId: 10143,
    name: 'Monad',
    currency: 'MONAD',
    explorerUrl: 'https://explorer.monad.xyz',
    rpcUrl: process.env.NEXT_PUBLIC_MONAD_RPC_URL || 'https://rpc.monad.xyz', // Replace with actual Monad RPC
  },
];

const wagmiConfig = defaultWagmiConfig({
  chains,
  projectId,
  metadata: {
    name: 'EmpowerTours',
    description: 'Travel Itinerary Marketplace',
    url: 'https://yourapp.com',
    icons: ['https://yourapp.com/icon.png'],
  },
});

createWeb3Modal({ wagmiConfig, projectId, chains });

const ITINERARY_MARKET_ADDRESS = process.env.NEXT_PUBLIC_ITINERARY_ADDRESS || '0x48a4b5b9f97682a4723ebfd0086c47c70b96478c';
const TOURS_ADDRESS = '0xa123600c82e69cb311b0e068b06bfa9f787699b7';
const PASSPORT_NFT_ADDRESS = '0x92d5a2b741b411988468549a5f117174a1ac8d7b';

interface Itinerary {
  id: number;
  creator: string;
  description: string;
  price: string;
  isActive: boolean;
}

export default function MarketPage() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [itineraryContract, setItineraryContract] = useState<ethers.Contract | null>(null);
  const [toursContract, setToursContract] = useState<ethers.Contract | null>(null);
  const [passportContract, setPassportContract] = useState<ethers.Contract | null>(null);
  const [itineraries, setItineraries] = useState<Itinerary[]>([]);
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [ownedPassports, setOwnedPassports] = useState<number[]>([]);

  // Fetch available itineraries using useReadContract
  const { data: travelData } = useReadContract({
    address: ITINERARY_MARKET_ADDRESS as `0x${string}`,
    abi: ItineraryMarketABI.abi as Abi,
    functionName: 'getAvailableItineraries',
    args: [],
  });

  useEffect(() => {
    const init = async () => {
      if (walletClient) {
        const provider = new ethers.BrowserProvider(walletClient);
        setProvider(provider);
        const signer = await provider.getSigner();
        const itineraryContract = new ethers.Contract(ITINERARY_MARKET_ADDRESS, ItineraryMarketABI.abi, signer);
        const toursContract = new ethers.Contract(TOURS_ADDRESS, ToursABI.abi, signer);
        const passportContract = new ethers.Contract(PASSPORT_NFT_ADDRESS, PassportNFTABI.abi, signer);
        setItineraryContract(itineraryContract);
        setToursContract(toursContract);
        setPassportContract(passportContract);
        if (address) {
          await fetchOwnedPassports(passportContract, address);
        }
      }
    };
    init();
  }, [walletClient, address]);

  useEffect(() => {
    if (travelData) {
      const fetchedItineraries = (travelData as any[]).map((itinerary: any) => ({
        id: Number(itinerary.id),
        creator: itinerary.creator,
        description: itinerary.description,
        price: ethers.formatEther(itinerary.price),
        isActive: itinerary.isActive,
      }));
      setItineraries(fetchedItineraries);
    }
  }, [travelData]);

  const fetchOwnedPassports = async (contract: ethers.Contract, userAddress: string) => {
    try {
      const balance = await contract.balanceOf(userAddress);
      const tokenIds: number[] = [];
      for (let i = 0; i < balance; i++) {
        const tokenId = await contract.tokenOfOwnerByIndex(userAddress, i);
        tokenIds.push(Number(tokenId));
      }
      setOwnedPassports(tokenIds);
    } catch (error) {
      console.error('Error fetching owned passports:', error);
    }
  };

  const approveTokens = async (amount: string) => {
    if (!toursContract || !itineraryContract) return;
    try {
      const tx = await toursContract.approve(ITINERARY_MARKET_ADDRESS, ethers.parseEther(amount));
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
      const tx = await itineraryContract.createItinerary(description, ethers.parseEther(price));
      await tx.wait();
      alert('Itinerary created!');
      setDescription('');
      setPrice('');
    } catch (error) {
      console.error('Error creating itinerary:', error);
      alert('Failed to create itinerary');
    }
  };

  const purchaseItinerary = async (id: number, price: string) => {
    if (!itineraryContract || !toursContract) return;
    try {
      await approveTokens(price);
      const tx = await itineraryContract.purchaseItinerary(id);
      await tx.wait();
      alert('Itinerary purchased!');
      if (passportContract && address) {
        await fetchOwnedPassports(passportContract, address);
      }
    } catch (error) {
      console.error('Error purchasing itinerary:', error);
      alert('Failed to purchase itinerary');
    }
  };

  return (
    <WagmiConfig config={wagmiConfig}>
      <div className="container">
        <h1>EmpowerTours Marketplace</h1>
        {isConnected ? (
          <p>Connected: {address}</p>
        ) : (
          <w3m-button label="Connect Wallet" />
        )}

        <h2>Create Itinerary</h2>
        <input
          type="text"
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <input
          type="text"
          placeholder="Price (TOURS)"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <button onClick={createItinerary} disabled={!isConnected}>
          Create Itinerary
        </button>

        <h2>Your Passports</h2>
        {ownedPassports.length > 0 ? (
          <ul>
            {ownedPassports.map((tokenId) => (
              <li key={tokenId}>Passport NFT #{tokenId}</li>
            ))}
          </ul>
        ) : (
          <p>No passports owned</p>
        )}

        <h2>Available Itineraries</h2>
        <ul>
          {itineraries.map((itinerary) => (
            <li key={itinerary.id} className="itinerary">
              <p>ID: {itinerary.id}</p>
              <p>Creator: {itinerary.creator}</p>
              <p>Description: {itinerary.description}</p>
              <p>Price: {itinerary.price} TOURS</p>
              <p>Status: {itinerary.isActive ? 'Active' : 'Inactive'}</p>
              {itinerary.isActive && (
                <button
                  onClick={() => purchaseItinerary(itinerary.id, itinerary.price)}
                  disabled={!isConnected}
                >
                  Purchase
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <style jsx>{`
        .container {
          padding: 20px;
          max-width: 800px;
          margin: 0 auto;
        }
        .itinerary {
          border: 1px solid #ccc;
          padding: 10px;
          margin: 10px 0;
        }
        input {
          margin: 10px;
          padding: 5px;
        }
        button {
          padding: 5px 10px;
          margin: 5px;
        }
      `}</style>
    </WagmiConfig>
  );
}
