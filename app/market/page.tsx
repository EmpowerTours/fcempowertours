'use client';

import { useState, useEffect, useCallback } from 'react';
import { parseEther, formatEther } from 'viem';
import { JsonRpcProvider, Contract, BrowserProvider } from 'ethers';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import PassportNFTABI from '../../lib/abis/PassportNFT.json';
import ItineraryMarketABI from '../../lib/abis/ItineraryMarket.json';
import ToursABI from '../../lib/abis/TOURS.json';
import TokenSwapABI from '../../lib/abis/TokenSwap.json';

const PASSPORT_NFT_ADDRESS = '0x2c26632F67f5E516704C3b6bf95B2aBbD9FC2BB4';
const ITINERARY_MARKET_ADDRESS = process.env.NEXT_PUBLIC_MARKET || '0x48a4B5b9F97682a4723eBFd0086C47C70B96478C';
const TOURS_ADDRESS = '0xa123600c82E69cB311B0e068B06Bfa9F787699B7';
const TOKEN_SWAP_ADDRESS = '0xe004F2eaCd0AD74E14085929337875b20975F0AA';
const RPC_URL = 'https://testnet-rpc.monad.xyz';

interface Itinerary {
  id: bigint;
  creator: string;
  description: string;
  price: bigint;
  isActive: boolean;
}

export default function MarketPage() {
  const { user, isLoading: contextLoading, error: contextError } = useFarcasterContext();
  const userAddress = user?.verifications?.[0] || user?.custody;

  const [itineraries, setItineraries] = useState<Itinerary[]>([]);
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [ownedPassports, setOwnedPassports] = useState<bigint[]>([]);
  const [isLoadingItineraries, setIsLoadingItineraries] = useState(false);
  const [isLoadingPassports, setIsLoadingPassports] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Swap widget state
  const [exchangeRate, setExchangeRate] = useState<string>('0');
  const [minMon, setMinMon] = useState<string>('0');
  const [toursBalance, setToursBalance] = useState<string>('0');
  const [contractToursBalance, setContractToursBalance] = useState<string>('0');

  const fetchAvailableItineraries = useCallback(async () => {
    setIsLoadingItineraries(true);
    try {
      const provider = new JsonRpcProvider(RPC_URL);
      const contract = new Contract(ITINERARY_MARKET_ADDRESS, ItineraryMarketABI, provider);
      const fetchedItineraries: Itinerary[] = [];
      let index = 0;
      while (true) {
        try {
          const itinerary = await contract.itineraries(index);
          if (itinerary[4]) {
            fetchedItineraries.push({
              id: itinerary[0],
              creator: String(itinerary[1]),
              description: String(itinerary[2]),
              price: itinerary[3],
              isActive: itinerary[4],
            });
          }
          index++;
        } catch {
          break;
        }
      }
      setItineraries(fetchedItineraries);
    } catch (error) {
      console.error('Error fetching itineraries:', String(error));
    } finally {
      setIsLoadingItineraries(false);
    }
  }, []);

  const fetchOwnedPassports = useCallback(async () => {
    if (!userAddress) return;
    setIsLoadingPassports(true);
    try {
      const provider = new JsonRpcProvider(RPC_URL);
      const contract = new Contract(PASSPORT_NFT_ADDRESS, PassportNFTABI, provider);
      const latestBlock = await provider.getBlockNumber();
      const fromBlock = latestBlock - 100;
      const filter = contract.filters.Transfer(null, userAddress);
      const events = await contract.queryFilter(filter, fromBlock, latestBlock);
      const tokenIds = events
        .filter((event: any) => event.args && event.args.to.toLowerCase() === userAddress.toLowerCase())
        .map((event: any) => event.args.tokenId)
        .filter((id: any): id is bigint => id != null);
      setOwnedPassports([...new Set(tokenIds)]);
    } catch (error) {
      console.error('Error fetching owned passports:', String(error));
    } finally {
      setIsLoadingPassports(false);
    }
  }, [userAddress]);

  const fetchSwapData = useCallback(async () => {
    if (!userAddress) return;
    try {
      const provider = new JsonRpcProvider(RPC_URL);
      
      // Token swap contract
      const swapContract = new Contract(TOKEN_SWAP_ADDRESS, TokenSwapABI, provider);
      const rate = await swapContract.exchangeRate();
      const min = await swapContract.minMon();
      
      // TOURS token contract
      const toursContract = new Contract(TOURS_ADDRESS, ToursABI, provider);
      const userBalance = await toursContract.balanceOf(userAddress);
      const contractBalance = await toursContract.balanceOf(TOKEN_SWAP_ADDRESS);
      
      setExchangeRate(rate.toString());
      setMinMon(min.toString());
      setToursBalance(userBalance.toString());
      setContractToursBalance(contractBalance.toString());
    } catch (error) {
      console.error('Error fetching swap data:', error);
    }
  }, [userAddress]);

  useEffect(() => {
    fetchAvailableItineraries();
  }, [fetchAvailableItineraries]);

  useEffect(() => {
    if (userAddress) {
      fetchOwnedPassports();
      fetchSwapData();
    }
  }, [userAddress, fetchOwnedPassports, fetchSwapData]);

  const getProvider = async () => {
    if (!window.ethereum) {
      throw new Error('Please install MetaMask or another Web3 wallet');
    }
    return new BrowserProvider(window.ethereum);
  };

  const createItinerary = async () => {
    if (!description || !price || !userAddress) return;
    setIsProcessing(true);
    try {
      const provider = await getProvider();
      const signer = await provider.getSigner();
      const contract = new Contract(ITINERARY_MARKET_ADDRESS, ItineraryMarketABI, signer);
      
      const tx = await contract.createItinerary(description, parseEther(price));
      console.log('Transaction sent:', tx.hash);
      
      await tx.wait();
      alert('Itinerary created successfully!');
      
      setDescription('');
      setPrice('');
      setTimeout(() => fetchAvailableItineraries(), 2000);
    } catch (error: any) {
      console.error('Create itinerary error:', error);
      alert('Failed to create itinerary: ' + (error.message || error));
    } finally {
      setIsProcessing(false);
    }
  };

  const purchaseItinerary = async (id: number, price: bigint) => {
    if (!userAddress) {
      alert('Please ensure you are in Warpcast and your wallet is connected');
      return;
    }

    setIsProcessing(true);
    try {
      const provider = await getProvider();
      const signer = await provider.getSigner();

      console.log('🛒 Step 1/2: Approving TOURS tokens...');
      
      // Step 1: Approve TOURS tokens
      const toursContract = new Contract(TOURS_ADDRESS, ToursABI, signer);
      const approveTx = await toursContract.approve(ITINERARY_MARKET_ADDRESS, price);
      console.log('✅ Approval transaction submitted:', approveTx.hash);
      
      await approveTx.wait();
      alert(`✅ Step 1/2 Complete!\n\nApproval confirmed: ${approveTx.hash.slice(0, 10)}...\n\nNow confirm the purchase transaction...`);

      console.log('🛒 Step 2/2: Purchasing itinerary...');

      // Step 2: Purchase the itinerary
      const marketContract = new Contract(ITINERARY_MARKET_ADDRESS, ItineraryMarketABI, signer);
      const purchaseTx = await marketContract.purchaseItinerary(BigInt(id));
      console.log('✅ Purchase transaction submitted:', purchaseTx.hash);
      
      await purchaseTx.wait();
      alert(`🎉 Purchase Complete!\n\nTransaction: ${purchaseTx.hash.slice(0, 10)}...\n\nRefreshing page...`);

      setTimeout(() => {
        fetchAvailableItineraries();
        fetchOwnedPassports();
        fetchSwapData();
      }, 2000);

    } catch (error: any) {
      console.error('❌ Purchase error:', error);

      if (error.message?.includes('user rejected') || error.message?.includes('User rejected')) {
        alert('❌ Transaction cancelled by user');
      } else if (error.message?.includes('insufficient') || error.message?.includes('Insufficient')) {
        alert('❌ Insufficient TOURS tokens in your wallet');
      } else {
        alert(`❌ Purchase failed: ${error.message || 'Unknown error'}`);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSwap = async (amount: number) => {
    if (!userAddress) {
      alert('Please ensure you are in Warpcast');
      return;
    }
    
    setIsProcessing(true);
    try {
      const provider = await getProvider();
      const signer = await provider.getSigner();
      const contract = new Contract(TOKEN_SWAP_ADDRESS, TokenSwapABI, signer);
      
      const monValue = parseEther(amount.toString());
      const tx = await contract.swap({ value: monValue });
      
      console.log('Swap transaction sent:', tx.hash);
      await tx.wait();
      
      alert(`Swap successful! Tx: ${tx.hash}`);
      
      setTimeout(() => fetchSwapData(), 2000);
    } catch (error: any) {
      console.error('Swap error:', error);
      alert(`Failed to swap: ${error.message || 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  if (contextLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">⏳</div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (contextError || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50">
        <div className="text-center p-8 bg-white rounded-2xl shadow-xl max-w-md">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Not in Farcaster</h1>
          <p className="text-gray-600 mb-6">
            This Mini App must be opened in Warpcast or another Farcaster client.
          </p>
          <p className="text-sm text-gray-500">Error: {contextError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-4">EmpowerTours Marketplace</h1>
      
      {/* User Info */}
      <div className="mb-6 p-4 bg-purple-50 rounded-lg border-2 border-purple-200">
        <p className="text-sm text-purple-900">
          <strong>✅ Connected:</strong> @{user.username}
        </p>
        <p className="text-sm text-purple-900 mt-1 font-mono">
          {userAddress?.slice(0, 6)}...{userAddress?.slice(-4)}
        </p>
      </div>

      {/* Swap Widget */}
      <div className="p-5 border border-gray-300 rounded-lg my-5 bg-white">
        <h3 className="text-xl font-semibold mb-4">Get $TOURS (Swap MON)</h3>
        <p className="mb-2">Rate: 1 MON = {((Number(exchangeRate) / 1e18) || 0).toFixed(0)} $TOURS</p>
        <p className="mb-2">Min: {((Number(minMon) / 1e18) || 0).toFixed(2)} MON</p>
        <p className="mb-2">Contract Balance: {((Number(contractToursBalance) / 1e18) || 0).toFixed(0)} $TOURS</p>
        <p className="mb-4">Your Balance: {((Number(toursBalance) / 1e18) || 0).toFixed(0)} $TOURS</p>
        <button
          onClick={() => handleSwap(0.1)}
          disabled={!userAddress || isProcessing}
          className="bg-purple-500 text-white px-4 py-2 rounded disabled:bg-gray-400"
        >
          {isProcessing ? 'Swapping...' : 'Swap 0.1 MON'}
        </button>
      </div>

      {/* Create Itinerary */}
      <div className="my-8 p-6 bg-white rounded-lg border border-gray-300">
        <h2 className="text-2xl font-semibold mb-4">Create Itinerary</h2>
        <input
          type="text"
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full p-2 border rounded mb-2"
        />
        <input
          type="text"
          placeholder="Price (TOURS)"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="w-full p-2 border rounded mb-2"
        />
        <button
          onClick={createItinerary}
          disabled={isProcessing || !userAddress}
          className="bg-green-500 text-white px-4 py-2 rounded disabled:bg-gray-400"
        >
          {isProcessing ? 'Creating...' : 'Create Itinerary'}
        </button>
      </div>

      {/* Your Passports */}
      <div className="my-8">
        <h2 className="text-2xl font-semibold mb-4">Your Passports</h2>
        {isLoadingPassports ? (
          <p className="text-gray-500">Loading passports...</p>
        ) : ownedPassports.length > 0 ? (
          <ul className="list-disc pl-5">
            {ownedPassports.map((tokenId) => (
              <li key={String(tokenId)}>{`Passport NFT #${String(tokenId)}`}</li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-500">No passports owned</p>
        )}
      </div>

      {/* Available Itineraries */}
      <div className="my-8">
        <h2 className="text-2xl font-semibold mb-4">Available Itineraries</h2>
        {isLoadingItineraries ? (
          <p className="text-gray-500">Loading itineraries...</p>
        ) : (
          <ul className="space-y-4">
            {itineraries.map((itinerary) => (
              <li key={String(itinerary.id)} className="border border-gray-300 p-4 rounded bg-white">
                <p><strong>ID:</strong> {String(itinerary.id)}</p>
                <p><strong>Creator:</strong> {String(itinerary.creator)}</p>
                <p><strong>Description:</strong> {String(itinerary.description)}</p>
                <p><strong>Price:</strong> {String(formatEther(itinerary.price))} TOURS</p>
                <p><strong>Status:</strong> {itinerary.isActive ? 'Active' : 'Inactive'}</p>
                {itinerary.isActive && (
                  <button
                    onClick={() => purchaseItinerary(Number(itinerary.id), itinerary.price)}
                    disabled={isProcessing || !userAddress}
                    className="bg-blue-500 text-white px-4 py-2 rounded mt-2 disabled:bg-gray-400"
                  >
                    {isProcessing ? 'Processing...' : 'Purchase'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
