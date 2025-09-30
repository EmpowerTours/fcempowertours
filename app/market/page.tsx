'use client';

import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { createWeb3Modal, defaultWagmiConfig } from '@web3modal/wagmi/react';
import { WagmiConfig, useAccount, useWalletClient, useReadContract } from 'wagmi';
import { Abi, defineChain } from 'viem';
import farcaster from '@farcaster/miniapp-wagmi-connector';
import ItineraryMarketABI from '../../lib/abis/ItineraryMarket.json';
import ToursABI from '../../lib/abis/TOURS.json';
import PassportNFTABI from '../../lib/abis/PassportNFT.json';

// Configure Wagmi for Monad chain
const projectId = process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || 'YOUR_WALLET_CONNECT_PROJECT_ID';
const monadChain = defineChain({
  id: 10143,
  name: 'Monad',
  nativeCurrency: { name: 'MONAD', symbol: 'MONAD', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_MONAD_RPC_URL || 'https://rpc.monad.xyz'] },
  },
  blockExplorers: {
    default: { name: 'Monad Explorer', url: 'https://explorer.monad.xyz' },
  },
});

const wagmiConfig = defaultWagmiConfig({
  chains: [monadChain],
  projectId,
  metadata: {
    name: 'EmpowerTours',
    description: 'Travel Itinerary Marketplace',
    url: 'https://yourapp.com',
    icons: ['https://yourapp.com/icon.png'],
  },
  connectors: [farcaster()],
});

createWeb3Modal({ wagmiConfig, projectId });

const ITINERARY_MARKET_ADDRESS = process.env.NEXT_PUBLIC_ITINERARY_ADDRESS || '0x48a4b5b9f97682a4723ebfd0086c47c70b96478c';
const TOURS_ADDRESS = '0xa123600c82e69cb311b0e068b06bfa9f787699b7';
const PASSPORT_NFT_ADDRESS = '0x92d5a2b741b411988468549a5f117174a1ac8d7b';
const ESCROW_VAULT_ADDRESS = '0xdd57b4eae4f7285db943edce8777f082b2f02f79';

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
  const [ownedPassports, setOwnedPassports] = useState<bigint[]>([]);

  // Fetch available itineraries
  const { data: travelData } = useReadContract({
    address: ITINERARY_MARKET_ADDRESS as `0x${string}`,
    abi: ItineraryMarketABI as Abi,
    functionName: 'getAvailableItineraries',
    args: [],
  });

  useEffect(() => {
    const init = async () => {
      if (walletClient) {
        const provider = new ethers.BrowserProvider(walletClient);
        const signer = await provider.getSigner();
        const itineraryContract = new ethers.Contract(ITINERARY_MARKET_ADDRESS, ItineraryMarketABI, signer);
        const toursContract = new ethers.Contract(TOURS_ADDRESS, ToursABI, signer);
        const passportContract = new ethers.Contract(PASSPORT_NFT_ADDRESS, PassportNFTABI, signer);
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
      const fetchedItineraries = (travelData as readonly Itinerary[]).map((itinerary: Itinerary) => ({
        id: itinerary.id,
        creator: itinerary.creator,
        description: itinerary.description,
        price: itinerary.price,
        isActive: itinerary.isActive,
      }));
      setItineraries(fetchedItineraries);
    }
  }, [travelData]);

  const fetchOwnedPassports = async (contract: ethers.Contract, userAddress: string) => {
    try {
      const balance = await contract.balanceOf(userAddress);
      const tokenIds: bigint[] = [];
      for (let i = 0; i < Number(balance); i++) {
        const tokenId = await contract.tokenOfOwnerByIndex(userAddress, i);
        tokenIds.push(tokenId);
      }
      setOwnedPassports(tokenIds);
    } catch (error) {
      console.error('Error fetching owned passports:', error);
    }
  };

  const approveTokens = async (amount: string) => {
    if (!toursContract) return;
    try {
      const tx = await toursContract.approve(ESCROW_VAULT_ADDRESS, ethers.parseEther(amount));
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

  const purchaseItinerary = async (id: number, price: bigint) => {
    if (!itineraryContract || !toursContract) return;
    try {
      await approveTokens(ethers.formatEther(price));
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
      <div style={containerStyle}>
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
          style={inputStyle}
        />
        <input
          type="text"
          placeholder="Price (TOURS)"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          style={inputStyle}
        />
        <button onClick={createItinerary} disabled={!isConnected} style={buttonStyle}>
          Create Itinerary
        </button>

        <h2>Your Passports</h2>
        {ownedPassports.length > 0 ? (
          <ul>
            {ownedPassports.map((tokenId) => (
              <li key={tokenId.toString()}>Passport NFT #{tokenId.toString()}</li>
            ))}
          </ul>
        ) : (
          <p>No passports owned</p>
        )}

        <h2>Available Itineraries</h2>
        <ul>
          {itineraries.map((itinerary) => (
            <li key={itinerary.id.toString()} style={itineraryStyle}>
              <p>ID: {itinerary.id.toString()}</p>
              <p>Creator: {itinerary.creator}</p>
              <p>Description: {itinerary.description}</p>
              <p>Price: {ethers.formatEther(itinerary.price)} TOURS</p>
              <p>Status: {itinerary.isActive ? 'Active' : 'Inactive'}</p>
              {itinerary.isActive && (
                <button
                  onClick={() => purchaseItinerary(Number(itinerary.id), itinerary.price)}
                  disabled={!isConnected}
                  style={buttonStyle}
                >
                  Purchase
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </WagmiConfig>
  );
}

const containerStyle: React.CSSProperties = {
  padding: '20px',
  maxWidth: '800px',
  margin: '0 auto',
};

const itineraryStyle: React.CSSProperties = {
  border: '1px solid #ccc',
  padding: '10px',
  margin: '10px 0',
};

const inputStyle: React.CSSProperties = {
  margin: '10px',
  padding: '5px',
};

const buttonStyle: React.CSSProperties = {
  padding: '5px 10px',
  margin: '5px',
};
