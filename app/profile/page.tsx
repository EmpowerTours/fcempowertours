'use client';
import { useState, useEffect } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';
import { useAccount } from 'wagmi';
import { ethers } from 'ethers';
import PassportNFTABI from '@/lib/abis/PassportNFT.json';
import MusicNFTABI from '@/lib/abis/MusicNFT.json';

const PASSPORT_NFT_ADDRESS = '0x2c26632F67f5E516704C3b6bf95B2aBbD9FC2BB4';
const MUSIC_NFT_ADDRESS = process.env.MUSICNFT_ADDRESS; // From env
const MONAD_RPC = 'https://testnet-rpc.monad.xyz';

// Type guard for EventLog
function isEventLog(event: ethers.Log | ethers.EventLog): event is ethers.EventLog {
  return 'args' in event;
}

export default function ProfilePage() {
  const [fid, setFid] = useState<string>('Not logged in');
  const [passports, setPassports] = useState<any[]>([]);
  const [musicNfts, setMusicNfts] = useState<any[]>([]);
  const { address: userAddress } = useAccount();

  useEffect(() => {
    async function fetchContext() {
      try {
        const context = await sdk.context;
        setFid(context.user?.fid?.toString() || 'Not logged in');
      } catch (error) {
        console.error('Error fetching context:', error);
      }
    }
    fetchContext();
  }, []);

  useEffect(() => {
    if (!userAddress) return;

    const provider = new ethers.JsonRpcProvider(MONAD_RPC);

    async function loadPassports() {
      try {
        const passportContract = new ethers.Contract(PASSPORT_NFT_ADDRESS, PassportNFTABI, provider);
        const filter = passportContract.filters.Transfer(null, userAddress);
        const events = await passportContract.queryFilter(filter, 0, 'latest');
        const tokenIds = events
          .filter(isEventLog)
          .filter((event) => userAddress && event.args.to.toLowerCase() === userAddress.toLowerCase())
          .map((event) => event.args.tokenId)
          .filter((id): id is bigint => id != null);

        const uniqueTokenIds = [...new Set(tokenIds)];
        const passportsArr = await Promise.all(
          uniqueTokenIds.map(async (tokenId) => {
            const tokenURI = await passportContract.tokenURI(tokenId);
            const metadataRes = await fetch(tokenURI.replace('ipfs://', 'https://harlequin-used-hare-224.mypinata.cloud/ipfs/'));
            const metadata = await metadataRes.json();
            return {
              id: tokenId.toString(),
              name: metadata.name || `Passport #${tokenId}`,
              image: metadata.image?.replace('ipfs://', 'https://harlequin-used-hare-224.mypinata.cloud/ipfs/'),
            };
          })
        );
        setPassports(passportsArr);
      } catch (err) {
        console.error('Failed to load passports:', err);
      }
    }

    async function loadMusicNfts() {
      if (!MUSIC_NFT_ADDRESS) return;
      try {
        const musicContract = new ethers.Contract(MUSIC_NFT_ADDRESS, MusicNFTABI, provider);
        const filter = musicContract.filters.Transfer(null, userAddress);
        const events = await musicContract.queryFilter(filter, 0, 'latest');
        const tokenIds = events
          .filter(isEventLog)
          .filter((event) => userAddress && event.args.to.toLowerCase() === userAddress.toLowerCase())
          .map((event) => event.args.tokenId)
          .filter((id): id is bigint => id != null);

        const uniqueTokenIds = [...new Set(tokenIds)];
        const musicNftsArr = await Promise.all(
          uniqueTokenIds.map(async (tokenId) => {
            const tokenURI = await musicContract.tokenURI(tokenId);
            const coverArt = await musicContract.getCoverArt(tokenId);
            const metadataRes = await fetch(tokenURI.replace('ipfs://', 'https://harlequin-used-hare-224.mypinata.cloud/ipfs/'));
            const metadata = await metadataRes.json();
            return {
              id: tokenId.toString(),
              name: metadata.name || `Music NFT #${tokenId}`,
              image: coverArt?.replace('ipfs://', 'https://harlequin-used-hare-224.mypinata.cloud/ipfs/'),
            };
          })
        );
        setMusicNfts(musicNftsArr);
      } catch (err) {
        console.error('Failed to load music NFTs:', err);
      }
    }

    loadPassports();
    loadMusicNfts();
  }, [userAddress]);

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold">Profile</h1>
      <p className="mt-2 text-gray-700">FID: {fid}</p>
      <p className="text-gray-700">Wallet: {userAddress || 'Not connected'}</p>
      {passports.length > 0 && (
        <div className="mt-6">
          <h2 className="text-xl font-semibold">Your Passports</h2>
          <div className="grid grid-cols-2 gap-4 mt-3">
            {passports.map((p, i) => (
              <div
                key={i}
                className="border rounded-lg p-3 shadow bg-gray-50 flex flex-col items-center"
              >
                {p.image && (
                  <img
                    src={p.image}
                    alt={p.name}
                    className="rounded-lg w-24 h-24 object-cover mb-2"
                  />
                )}
                <p className="font-medium text-sm">{p.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {musicNfts.length > 0 && (
        <div className="mt-6">
          <h2 className="text-xl font-semibold">Your Music NFTs</h2>
          <div className="grid grid-cols-2 gap-4 mt-3">
            {musicNfts.map((nft, i) => (
              <div
                key={i}
                className="border rounded-lg p-3 shadow bg-gray-50 flex flex-col items-center"
              >
                {nft.image && (
                  <img
                    src={nft.image}
                    alt={nft.name}
                    className="rounded-lg w-24 h-24 object-cover mb-2"
                  />
                )}
                <p className="font-medium text-sm">{nft.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
