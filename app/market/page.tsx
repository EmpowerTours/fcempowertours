'use client';

import { useState, useEffect, useCallback } from 'react';
import { parseEther, formatEther } from 'viem';
import { JsonRpcProvider, Contract, Log, EventLog } from 'ethers';
import PassportNFTABI from '../../lib/abis/PassportNFT.json';
import ItineraryMarketABI from '../../lib/abis/ItineraryMarket.json';
import ToursABI from '../../lib/abis/TOURS.json';
import TokenSwapABI from '../../lib/abis/TokenSwap.json';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';

const PASSPORT_NFT_ADDRESS = '0x2c26632F67f5E516704C3b6bf95B2aBbD9FC2BB4' as `0x${string}`;
const ITINERARY_MARKET_ADDRESS = (process.env.NEXT_PUBLIC_MARKET || '0x48a4B5b9F97682a4723eBFd0086C47C70B96478C') as `0x${string}`;
const TOURS_ADDRESS = '0xa123600c82E69cB311B0e068B06Bfa9F787699B7' as `0x${string}`;
const TOKEN_SWAP_ADDRESS = '0xe004F2eaCd0AD74E14085929337875b20975F0AA' as const;

interface Itinerary {
  id: bigint;
  creator: string;
  description: string;
  price: bigint;
  isActive: boolean;
}

function isEventLog(event: Log | EventLog): event is EventLog {
  return 'args' in event;
}

export default function MarketPage() {
  const { address: userAddress } = useAccount();
  const { writeContractAsync, isPending: writePending, data: txHash } = useWriteContract();
  const { isLoading: receiptLoading } = useWaitForTransactionReceipt({ 
    hash: txHash as `0x${string}` | undefined 
  });
  const [itineraries, setItineraries] = useState<Itinerary[]>([]);
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [ownedPassports, setOwnedPassports] = useState<bigint[]>([]);
  const [isMounted, setIsMounted] = useState(false);
  const [isLoadingItineraries, setIsLoadingItineraries] = useState(false);
  const [isLoadingPassports, setIsLoadingPassports] = useState(false);

  useEffect(() => setIsMounted(true), []);

  const fetchAvailableItineraries = useCallback(async () => {
    setIsLoadingItineraries(true);
    try {
      const provider = new JsonRpcProvider('https://testnet-rpc.monad.xyz');
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

  useEffect(() => {
    fetchAvailableItineraries();
  }, [fetchAvailableItineraries]);

  const fetchOwnedPassports = useCallback(async () => {
    if (!userAddress) return;
    setIsLoadingPassports(true);
    try {
      const provider = new JsonRpcProvider('https://testnet-rpc.monad.xyz');
      const contract = new Contract(PASSPORT_NFT_ADDRESS, PassportNFTABI, provider);
      const latestBlock = await provider.getBlockNumber();
      const fromBlock = latestBlock - 100;
      const filter = contract.filters.Transfer(null, userAddress);
      const events = await contract.queryFilter(filter, fromBlock, latestBlock) as (Log | EventLog)[];
      const tokenIds = events
        .filter(isEventLog)
        .filter((event) => event.args.to.toLowerCase() === userAddress.toLowerCase())
        .map((event) => event.args.tokenId)
        .filter((id): id is bigint => id != null);
      setOwnedPassports([...new Set(tokenIds)]);
    } catch (error) {
      console.error('Error fetching owned passports:', String(error));
    } finally {
      setIsLoadingPassports(false);
    }
  }, [userAddress]);

  useEffect(() => {
    fetchOwnedPassports();
  }, [fetchOwnedPassports]);

  const createItinerary = async () => {
    if (!description || !price) return;
    try {
      await writeContractAsync({
        address: ITINERARY_MARKET_ADDRESS,
        abi: ItineraryMarketABI,
        functionName: 'createItinerary',
        args: [description, parseEther(price)],
      });
      setDescription('');
      setPrice('');
      setTimeout(() => window.location.reload(), 3000);
    } catch (error: any) {
      alert('Failed to create itinerary: ' + String(error.message || error));
    }
  };

  const purchaseItinerary = async (id: number, price: bigint) => {
    if (!userAddress) return;
    try {
      await writeContractAsync({
        address: TOURS_ADDRESS,
        abi: ToursABI,
        functionName: 'approve',
        args: [ITINERARY_MARKET_ADDRESS, price],
      });
      await writeContractAsync({
        address: ITINERARY_MARKET_ADDRESS,
        abi: ItineraryMarketABI,
        functionName: 'purchaseItinerary',
        args: [BigInt(id)],
      });
      setTimeout(() => window.location.reload(), 3000);
    } catch (error: any) {
      alert('Failed to purchase: ' + String(error.message || error));
    }
  };

  if (!isMounted) {
    return <div className="p-5 max-w-3xl mx-auto">Loading...</div>;
  }

  return (
    <div className="p-5 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-4">EmpowerTours Marketplace</h1>
      {userAddress ? (
        <p className="mb-4">Connected: {String(userAddress).slice(0, 6)}...{String(userAddress).slice(-4)}</p>
      ) : (
        <button 
          onClick={() => window.ethereum?.request({ method: 'eth_requestAccounts' })}
          className="bg-blue-500 text-white px-4 py-2 rounded mb-4"
        >
          Connect Wallet
        </button>
      )}
      
      <SwapWidget />
      
      <div className="my-8">
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
          disabled={writePending || receiptLoading || !userAddress}
          className="bg-green-500 text-white px-4 py-2 rounded disabled:bg-gray-400"
        >
          {writePending || receiptLoading ? 'Creating...' : 'Create Itinerary'}
        </button>
      </div>

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

      <div className="my-8">
        <h2 className="text-2xl font-semibold mb-4">Available Itineraries</h2>
        {isLoadingItineraries ? (
          <p className="text-gray-500">Loading itineraries...</p>
        ) : (
          <ul className="space-y-4">
            {itineraries.map((itinerary) => (
              <li key={String(itinerary.id)} className="border border-gray-300 p-4 rounded">
                <p><strong>ID:</strong> {String(itinerary.id)}</p>
                <p><strong>Creator:</strong> {String(itinerary.creator)}</p>
                <p><strong>Description:</strong> {String(itinerary.description)}</p>
                <p><strong>Price:</strong> {String(formatEther(itinerary.price))} TOURS</p>
                <p><strong>Status:</strong> {itinerary.isActive ? 'Active' : 'Inactive'}</p>
                {itinerary.isActive && (
                  <button
                    onClick={() => purchaseItinerary(Number(itinerary.id), itinerary.price)}
                    disabled={writePending || receiptLoading || !userAddress}
                    className="bg-blue-500 text-white px-4 py-2 rounded mt-2 disabled:bg-gray-400"
                  >
                    {writePending || receiptLoading ? 'Purchasing...' : 'Purchase'}
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

function SwapWidget() {
  const { address } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();
  const { data: exchangeRate } = useReadContract({
    address: TOKEN_SWAP_ADDRESS,
    abi: TokenSwapABI,
    functionName: 'exchangeRate',
  });
  const { data: minMon } = useReadContract({
    address: TOKEN_SWAP_ADDRESS,
    abi: TokenSwapABI,
    functionName: 'minMon',
  });
  const { data: toursBalance } = useReadContract({
    address: TOURS_ADDRESS,
    abi: ToursABI,
    functionName: 'balanceOf',
    args: [address!],
    query: { enabled: !!address },
  });
  const { data: contractToursBalance } = useReadContract({
    address: TOURS_ADDRESS,
    abi: ToursABI,
    functionName: 'balanceOf',
    args: [TOKEN_SWAP_ADDRESS],
  });

  const handleSwap = async (amount: number) => {
    if (!address) {
      alert('Please connect your wallet');
      return;
    }
    const monValue = parseEther(amount.toString());
    try {
      const hash = await writeContractAsync({
        address: TOKEN_SWAP_ADDRESS,
        abi: TokenSwapABI,
        functionName: 'swap',
        args: [],  // IMPORTANT: swap() takes no arguments
        value: monValue,  // The MON amount is sent as value
      });
      alert(`Swap successful! Tx: ${hash}`);
    } catch (err) {
      console.error('Swap error:', err);
      alert(`Failed to swap: ${String(err)}`);
    }
  };

  return (
    <div className="p-5 border border-gray-300 rounded-lg my-5">
      <h3 className="text-xl font-semibold mb-4">Get $TOURS (Swap MON)</h3>
      <p className="mb-2">Rate: 1 MON = {((Number(exchangeRate) / 1e18) || 0).toFixed(0)} $TOURS</p>
      <p className="mb-2">Min: {((Number(minMon) / 1e18) || 0).toFixed(2)} MON</p>
      <p className="mb-2">Contract Balance: {((Number(contractToursBalance) / 1e18) || 0).toFixed(0)} $TOURS</p>
      <p className="mb-4">Your Balance: {((Number(toursBalance) / 1e18) || 0).toFixed(0)} $TOURS</p>
      <button 
        onClick={() => handleSwap(0.1)} 
        disabled={!address || isPending}
        className="bg-purple-500 text-white px-4 py-2 rounded disabled:bg-gray-400"
      >
        {isPending ? 'Swapping...' : 'Swap 0.1 MON'}
      </button>
    </div>
  );
}
