'use client';

export const dynamic = "force-dynamic";

import { useState, useEffect } from 'react';
import { JsonRpcProvider, BrowserProvider, parseEther, formatEther, Contract, BigNumberish, TransactionResponse, Log, EventLog } from 'ethers';
import { useAccount } from 'wagmi';
import { useRouter } from 'next/navigation';
import PassportNFTABI from '../../lib/abis/PassportNFT.json';
import ItineraryMarketABI from '../../lib/abis/ItineraryMarket.json';
import ToursABI from '../../lib/abis/TOURS.json';

// ✅ Define TypeScript type for TOURS (ERC-20) contract
type ToursContract = Contract & {
  approve(spender: string, amount: BigNumberish): Promise<TransactionResponse>;
  balanceOf(owner: string): Promise<bigint>;
  transfer(to: string, amount: BigNumberish): Promise<TransactionResponse>;
};

// ✅ Define TypeScript type for ItineraryMarket contract
type ItineraryMarketContract = Contract & {
  createItinerary(description: string, price: BigNumberish): Promise<TransactionResponse>;
  purchaseItinerary(id: number): Promise<TransactionResponse>;
  itineraries(index: number): Promise<[bigint, string, string, bigint, boolean]>;
};

interface Itinerary {
  id: bigint;
  creator: string;
  description: string;
  price: bigint;
  isActive: boolean;
}

const PASSPORT_NFT_ADDRESS = '0x2c26632F67f5E516704C3b6bf95B2aBbD9FC2BB4';
const ITINERARY_MARKET_ADDRESS =
  process.env.NEXT_PUBLIC_MARKET || '0x48a4B5b9F97682a4723eBFd0086C47C70B96478C';
const TOURS_ADDRESS = '0xa123600c82e69cb311b0e068b06bfa9f787699b7';

export default function MarketPage() {
  const { address: userAddress } = useAccount();
  const router = useRouter();
  const [itineraryContract, setItineraryContract] = useState<ItineraryMarketContract | null>(null);
  const [toursContract, setToursContract] = useState<ToursContract | null>(null);
  const [passportContract, setPassportContract] = useState<Contract | null>(null);
  const [itineraries, setItineraries] = useState<Itinerary[]>([]);
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [ownedPassports, setOwnedPassports] = useState<bigint[]>([]);

  // Initialize contracts
  useEffect(() => {
    const init = async () => {
      try {
        const provider = new JsonRpcProvider('https://testnet-rpc.monad.xyz');
        const itinerary = new Contract(
          ITINERARY_MARKET_ADDRESS,
          ItineraryMarketABI,
          provider
        ) as unknown as ItineraryMarketContract;
        const tours = new Contract(TOURS_ADDRESS, ToursABI, provider) as unknown as ToursContract;
        const passport = new Contract(PASSPORT_NFT_ADDRESS, PassportNFTABI, provider);
        setItineraryContract(itinerary);
        setToursContract(tours);
        setPassportContract(passport);
        if (userAddress) {
          await fetchOwnedPassports(passport, userAddress);
        }
        await fetchAvailableItineraries(itinerary);
      } catch (error) {
        console.error('Error initializing contracts:', error);
      }
    };
    if (window.ethereum) init();
  }, [userAddress]);

  // Fetch all active itineraries
  const fetchAvailableItineraries = async (contract: ItineraryMarketContract) => {
    try {
      const fetchedItineraries: Itinerary[] = [];
      let index = 0;
      while (true) {
        try {
          const itinerary = await contract.itineraries(index);
          if (itinerary[4]) {
            fetchedItineraries.push({
              id: itinerary[0],
              creator: itinerary[1],
              description: itinerary[2],
              price: itinerary[3],
              isActive: itinerary[4],
            });
          }
          index++;
        } catch {
          break; // stop when out of range
        }
      }
      setItineraries(fetchedItineraries);
    } catch (error) {
      console.error('Error fetching itineraries:', error);
    }
  };

  // Fetch all Passport NFTs owned by the user
  const fetchOwnedPassports = async (contract: Contract, userAddress: string) => {
    try {
      const filter = contract.filters.Transfer(null, userAddress);
      const events = await contract.queryFilter(filter, 0, 'latest') as (Log | EventLog)[];
      const tokenIds = events
        .filter((event): event is EventLog => 'args' in event && !!event.args)
        .filter((event: EventLog) => event.args.to.toLowerCase() === userAddress.toLowerCase())
        .map((event: EventLog) => event.args.tokenId)
        .filter((id: BigNumberish): id is bigint => id != null);
      setOwnedPassports([...new Set(tokenIds)]);
    } catch (error) {
      console.error('Error fetching owned passports:', error);
    }
  };

  // ✅ Approve TOURS tokens
  const approveTokens = async (amount: string) => {
    if (!toursContract) return;
    try {
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contractWithSigner = toursContract.connect(signer) as ToursContract;
      const tx = await contractWithSigner.approve(
        ITINERARY_MARKET_ADDRESS,
        parseEther(amount)
      );
      await tx.wait();
      alert('Tokens approved for spending!');
    } catch (error) {
      console.error('Error approving tokens:', error);
      alert('Failed to approve tokens');
    }
  };

  // ✅ Create new itinerary
  const createItinerary = async () => {
    if (!itineraryContract || !description || !price) return;
    try {
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contractWithSigner = itineraryContract.connect(signer) as ItineraryMarketContract;
      const tx = await contractWithSigner.createItinerary(description, parseEther(price));
      await tx.wait();
      alert('Itinerary created!');
      setDescription('');
      setPrice('');
      await fetchAvailableItineraries(itineraryContract);
    } catch (error) {
      console.error('Error creating itinerary:', error);
      alert('Failed to create itinerary');
    }
  };

  // ✅ Purchase itinerary
  const purchaseItinerary = async (id: number, price: bigint) => {
    if (!itineraryContract || !toursContract || !passportContract || !userAddress) return;
    try {
      await approveTokens(formatEther(price));
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contractWithSigner = itineraryContract.connect(signer) as ItineraryMarketContract;
      const tx = await contractWithSigner.purchaseItinerary(id);
      await tx.wait();
      alert('Itinerary purchased!');
      await fetchOwnedPassports(passportContract, userAddress);
      await fetchAvailableItineraries(itineraryContract);
    } catch (error: any) {
      console.error('Error purchasing itinerary:', error);
      alert('Failed to purchase itinerary: ' + error.message);
    }
  };

  return (
    <div style={containerStyle}>
      <nav>
        <button onClick={() => router.push('/passport')} className="text-blue-500">Passport</button>
        <button onClick={() => router.push('/music')} className="text-blue-500">Music</button>
        <button onClick={() => router.push('/market')} className="text-blue-500">Market</button>
        <button onClick={() => router.push('/profile')} className="text-blue-500">Profile</button>
      </nav>
      <h1>EmpowerTours Marketplace</h1>
      {userAddress ? (
        <p>Connected: {userAddress}</p>
      ) : (
        <button onClick={() => window.ethereum.request({ method: 'eth_requestAccounts' })}>
          Connect Wallet
        </button>
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
      <button onClick={createItinerary} disabled={!userAddress} style={buttonStyle}>
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
            <p>Price: {formatEther(itinerary.price)} TOURS</p>
            <p>Status: {itinerary.isActive ? 'Active' : 'Inactive'}</p>
            {itinerary.isActive && (
              <button
                onClick={() => purchaseItinerary(Number(itinerary.id), itinerary.price)}
                disabled={!userAddress}
                style={buttonStyle}
              >
                Purchase
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ✅ Basic styles
const containerStyle: React.CSSProperties = {
  padding: '20px',
  maxWidth: '800px',
  margin: '0 auto',
};
const inputStyle: React.CSSProperties = {
  margin: '10px',
  padding: '5px',
};
const buttonStyle: React.CSSProperties = {
  padding: '5px 10px',
  margin: '5px',
};
const itineraryStyle: React.CSSProperties = {
  border: '1px solid #ccc',
  padding: '10px',
  margin: '10px 0',
};
