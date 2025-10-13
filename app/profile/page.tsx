'use client';

import { useState, useEffect, useCallback } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';
import { useAccount } from 'wagmi';
import { JsonRpcProvider, Contract, Log, EventLog } from 'ethers';
import PassportNFTABI from '@/lib/abis/PassportNFT.json';
import MusicNFTABI from '@/lib/abis/MusicNFT.json';

const PASSPORT_NFT_ADDRESS = '0x2c26632F67f5E516704C3b6bf95B2aBbD9FC2BB4';
const MUSIC_NFT_ADDRESS = process.env.MUSICNFT_ADDRESS;
const MONAD_RPC = 'https://testnet-rpc.monad.xyz';

function isEventLog(event: Log | EventLog): event is EventLog {
  return 'args' in event;
}

export default function ProfilePage() {
  const [fid, setFid] = useState<string>('Not logged in');
  const [passports, setPassports] = useState<any[]>([]);
  const [musicNfts, setMusicNfts] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [isMounted, setIsMounted] = useState(false);
  const [isLoadingContext, setIsLoadingContext] = useState(true);
  const [isLoadingPassports, setIsLoadingPassports] = useState(false);
  const [isLoadingMusicNfts, setIsLoadingMusicNfts] = useState(false);
  const { address: userAddress } = useAccount();

  useEffect(() => setIsMounted(true), []);

  const fetchContext = useCallback(async () => {
    setIsLoadingContext(true);
    try {
      const context = await sdk.context;
      setFid(String(context.user?.fid || 'Not logged in'));
    } catch (err) {
      console.error('Error fetching context:', String(err));
      setError('Failed to fetch profile context');
    } finally {
      setIsLoadingContext(false);
    }
  }, []);

  useEffect(() => {
    fetchContext();
  }, [fetchContext]);

  const loadPassports = useCallback(async () => {
    if (!userAddress) return;
    setIsLoadingPassports(true);
    try {
      const provider = new JsonRpcProvider(MONAD_RPC);
      const passportContract = new Contract(PASSPORT_NFT_ADDRESS, PassportNFTABI, provider);
      const latestBlock = await provider.getBlockNumber();
      const fromBlock = latestBlock - 100;
      const filter = passportContract.filters.Transfer(null, userAddress);
      const events = await passportContract.queryFilter(filter, fromBlock, latestBlock);
      const tokenIds = events
        .filter(isEventLog)
        .filter((event) => userAddress && event.args.to.toLowerCase() === userAddress.toLowerCase())
        .map((event) => event.args.tokenId)
        .filter((id): id is bigint => id != null);

      const uniqueTokenIds = [...new Set(tokenIds)];
      const passportsArr = await Promise.all(
        uniqueTokenIds.map(async (tokenId) => {
          try {
            const tokenURI = await passportContract.tokenURI(tokenId);
            const metadataRes = await fetch(tokenURI.replace('ipfs://', 'https://harlequin-used-hare-224.mypinata.cloud/ipfs/'));
            if (!metadataRes.ok) throw new Error(`HTTP ${metadataRes.status}`);
            const metadata = await metadataRes.json();
            if (typeof metadata.name !== 'string') {
              console.warn('Non-string metadata.name:', metadata.name, 'for token', tokenId);
            }
            return {
              id: String(tokenId),
              name: String(metadata.name || `Passport #${tokenId}`),
              image: String(metadata.image || '').replace('ipfs://', 'https://harlequin-used-hare-224.mypinata.cloud/ipfs/'),
            };
          } catch (err) {
            console.error(`Failed to load passport metadata for ${tokenId}:`, String(err));
            return {
              id: String(tokenId),
              name: `Passport #${tokenId}`,
              image: '',
            };
          }
        })
      );
      setPassports(passportsArr);
    } catch (err) {
      console.error('Failed to load passports:', String(err));
      setError('Failed to load passports');
    } finally {
      setIsLoadingPassports(false);
    }
  }, [userAddress]);

  const loadMusicNfts = useCallback(async () => {
    if (!MUSIC_NFT_ADDRESS || !userAddress) return;
    setIsLoadingMusicNfts(true);
    try {
      const provider = new JsonRpcProvider(MONAD_RPC);
      const musicContract = new Contract(MUSIC_NFT_ADDRESS, MusicNFTABI, provider);
      const latestBlock = await provider.getBlockNumber();
      const fromBlock = latestBlock - 100;
      const filter = musicContract.filters.Transfer(null, userAddress);
      const events = await musicContract.queryFilter(filter, fromBlock, latestBlock);
      const tokenIds = events
        .filter(isEventLog)
        .filter((event) => userAddress && event.args.to.toLowerCase() === userAddress.toLowerCase())
        .map((event) => event.args.tokenId)
        .filter((id): id is bigint => id != null);

      const uniqueTokenIds = [...new Set(tokenIds)];
      const musicNftsArr = await Promise.all(
        uniqueTokenIds.map(async (tokenId) => {
          try {
            const tokenURI = await musicContract.tokenURI(tokenId);
            const coverArt = await musicContract.getCoverArt(tokenId);
            const metadataRes = await fetch(tokenURI.replace('ipfs://', 'https://harlequin-used-hare-224.mypinata.cloud/ipfs/'));
            if (!metadataRes.ok) throw new Error(`HTTP ${metadataRes.status}`);
            const metadata = await metadataRes.json();
            if (typeof metadata.name !== 'string') {
              console.warn('Non-string metadata.name:', metadata.name, 'for music token', tokenId);
            }
            return {
              id: String(tokenId),
              name: String(metadata.name || `Music NFT #${tokenId}`),
              image: String(coverArt || '').replace('ipfs://', 'https://harlequin-used-hare-224.mypinata.cloud/ipfs/'),
            };
          } catch (err) {
            console.error(`Failed to load music NFT metadata for ${tokenId}:`, String(err));
            return {
              id: String(tokenId),
              name: `Music NFT #${tokenId}`,
              image: '',
            };
          }
        })
      );
      setMusicNfts(musicNftsArr);
    } catch (err) {
      console.error('Failed to load music NFTs:', String(err));
      setError('Failed to load music NFTs');
    } finally {
      setIsLoadingMusicNfts(false);
    }
  }, [userAddress]);

  useEffect(() => {
    loadPassports();
    loadMusicNfts();
  }, [loadPassports, loadMusicNfts]);

  if (!isMounted) return <div>Loading...</div>;

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold">Profile</h1>
      {isLoadingContext ? (
        <p className="text-gray-500 mt-2">Loading FID...</p>
      ) : (
        <p className="mt-2 text-gray-700">FID: {String(fid)}</p>
      )}
      <p className="text-gray-700">Wallet: {String(userAddress || 'Not connected')}</p>
      {error && <p className="text-red-500 mt-2">{String(error)}</p>}
      {isLoadingPassports ? (
        <p className="text-gray-500 mt-6">Loading passports...</p>
      ) : passports?.length > 0 ? (
        <div className="mt-6">
          <h2 className="text-xl font-semibold">Your Passports</h2>
          <div className="grid grid-cols-2 gap-4 mt-3">
            {passports.map((p, i) => (
              <div
                key={p.id || i}
                className="border rounded-lg p-3 shadow bg-gray-50 flex flex-col items-center"
              >
                {p.image && p.image !== '' && (
                  <img
                    src={String(p.image)}
                    alt={String(p.name)}
                    className="rounded-lg w-24 h-24 object-cover mb-2"
                  />
                )}
                <p className="font-medium text-sm">{String(p.name)}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-6 text-gray-500">No passports owned</p>
      )}
      {isLoadingMusicNfts ? (
        <p className="text-gray-500 mt-6">Loading music NFTs...</p>
      ) : musicNfts?.length > 0 ? (
        <div className="mt-6">
          <h2 className="text-xl font-semibold">Your Music NFTs</h2>
          <div className="grid grid-cols-2 gap-4 mt-3">
            {musicNfts.map((nft, i) => (
              <div
                key={nft.id || i}
                className="border rounded-lg p-3 shadow bg-gray-50 flex flex-col items-center"
              >
                {nft.image && nft.image !== '' && (
                  <img
                    src={String(nft.image)}
                    alt={String(nft.name)}
                    className="rounded-lg w-24 h-24 object-cover mb-2"
                  />
                )}
                <p className="font-medium text-sm">{String(nft.name)}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-6 text-gray-500">No music NFTs owned</p>
      )}
    </div>
  );
}
