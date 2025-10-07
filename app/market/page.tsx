'use client';
import { useState, useEffect } from 'react';
import { ethers, InterfaceAbi } from 'ethers';
import { useAccount, useWalletClient } from 'wagmi';
import { parseAbi } from 'viem';
import { useRouter } from 'next/navigation';
import ItineraryMarketABI from '../../lib/abis/ItineraryMarket.json';
import ToursABI from '../../lib/abis/TOURS.json';
import PassportNFTABI from '../../lib/abis/PassportNFT.json';

const ITINERARY_MARKET_ADDRESS = process.env.NEXT_PUBLIC_MARKET || '0x48a4B5b9F97682a4723eBFd0086C47C70B96478C';
const TOURS_ADDRESS = '0xa123600c82e69cb311b0e068b06bfa9f787699b7';
const PASSPORT_NFT_ADDRESS = '0x2c26632f67f5e516704c3b6bf95b2abbd9fc2bb4';

const itineraryABI: InterfaceAbi = ItineraryMarketABI;
const toursABI: InterfaceAbi = ToursABI;
const passportABI: InterfaceAbi = PassportNFTABI;
parseAbi(ItineraryMarketABI as any); // For wagmi compatibility, if needed

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
  const router = useRouter();
  const [itineraryContract, setItineraryContract] = useState<ethers.Contract | null>(null);
  const [toursContract, setToursContract] = useState<ethers.Contract | null>(null);
  const [passportContract, setPassportContract] = useState<ethers.Contract | null>(null);
  const [itineraries, setItineraries] = useState<Itinerary[]>([]);
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [ownedPassports, setOwnedPassports] = useState<bigint[]>([]);

  useEffect(() => {
    const init = async () => {
      if (walletClient) {
        const provider = new ethers.BrowserProvider(walletClient);
        const signer = await provider.getSigner();
        const itineraryContract = new ethers.Contract(ITINERARY_MARKET_ADDRESS, itineraryABI, signer);
        const toursContract = new ethers.Contract(TOURS_ADDRESS, toursABI, signer);
        const passportContract = new ethers.Contract(PASSPORT_NFT_ADDRESS, passportABI, signer);
        setItineraryContract(itineraryContract);
        setToursContract(toursContract);
        setPassportContract(passportContract);
        if (address) {
          await fetchOwnedPassports(passportContract, address);
        }
        await fetchAvailableItineraries(itineraryContract);
      }
    };
    init();
  }, [walletClient, address]);

  const fetchAvailableItineraries = async (contract: ethers.Contract) => {
    try {
      const length = await contract.itineraries.length;
      const fetchedItineraries: Itinerary[] = [];
      for (let i = 0; i < Number(length); i++) {
        const itinerary = await contract.itineraries(i);
        if (itinerary[4]) { // isActive is index 4
          fetchedItineraries.push({
            id: itinerary[0],
            creator: itinerary[1],
            description: itinerary[2],
            price: itinerary[3],
            isActive: itinerary[4],
          });
        }
      }
      setItineraries(fetchedItineraries);
    } catch (error) {
      console.error('Error fetching itineraries:', error);
    }
  };

  const fetchOwnedPassports = async (contract: ethers.Contract, userAddress: string) => {
    try {
      const filter = contract.filters.Transfer(null, userAddress);
      const events = await contract.queryFilter(filter, 0, 'latest');
      const tokenIds = events
        .filter((event): event is ethers.EventLog => 'args' in event)
        .filter(event => event.args.to.toLowerCase() === userAddress.toLowerCase())
        .map(event => event.args.tokenId)
        .filter(id => id != null);
      setOwnedPassports([...new Set(tokenIds)]);
    } catch (error) {
      console.error('Error fetching owned passports:', error);
    }
  };

  const approveTokens = async (amount: string) => {
    if (!toursContract) return;
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
      await fetchAvailableItineraries(itineraryContract);
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
      await fetchAvailableItineraries(itineraryContract);
    } catch (error: any) {
      console.error('Error purchasing itinerary:', error);
      if (error.message.includes('DeepAI image generation failed')) {
        alert('Failed to purchase itinerary: Metadata upload failed due to DeepAI error. Please try again later.');
      } else {
        alert('Failed to purchase itinerary: ' + error.message);
      }
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
  );
}

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
