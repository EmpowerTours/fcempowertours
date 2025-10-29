'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { parseEther, encodeFunctionData, createPublicClient, http, isAddress } from 'viem';
import Link from 'next/link';

// Environment variables from Railway
const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'https://indexer.dev.hyperindex.xyz/32e51fc/v1/graphql';
const PINATA_GATEWAY = process.env.PINATA_GATEWAY || 'harlequin-used-hare-224.mypinata.cloud';
const MUSIC_NFT_ADDRESS = process.env.NEXT_PUBLIC_MUSICNFT_ADDRESS || '0x5adb6c3Dc258f2730c488Ea81883dc222A7426B6';
const TOURS_ADDRESS = process.env.NEXT_PUBLIC_TOURS_TOKEN || '0xa123600c82E69cB311B0e068B06Bfa9F787699B7';
const MONAD_RPC_URL = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://testnet-rpc.monad.xyz';

// Viem client for transaction polling and contract reads
const client = createPublicClient({
  chain: {
    id: 10143, // Monad testnet
    name: 'Monad Testnet',
    nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
    rpcUrls: { default: { http: [MONAD_RPC_URL] } },
  },
  transport: http(),
});

// [MUSIC_NFT_ABI and ERC20_ABI remain the same - included for completeness]
const MUSIC_NFT_ABI = [
  {
    inputs: [{ internalType: 'address', name: '_treasury', type: 'address' }, { internalType: 'address', name: '_toursToken', type: 'address' }],
    stateMutability: 'nonpayable',
    type: 'constructor',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'owner', type: 'address' },
      { indexed: true, internalType: 'address', name: 'approved', type: 'address' },
      { indexed: true, internalType: 'uint256', name: 'tokenId', type: 'uint256' },
    ],
    name: 'Approval',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'owner', type: 'address' },
      { indexed: true, internalType: 'address', name: 'operator', type: 'address' },
      { indexed: false, internalType: 'bool', name: 'approved', type: 'bool' },
    ],
    name: 'ApprovalForAll',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: 'uint256', name: '_fromTokenId', type: 'uint256' },
      { indexed: false, internalType: 'uint256', name: '_toTokenId', type: 'uint256' },
    ],
    name: 'BatchMetadataUpdate',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [{ indexed: true, internalType: 'uint256', name: 'licenseId', type: 'uint256' }],
    name: 'LicenseExpired',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'licenseId', type: 'uint256' },
      { indexed: true, internalType: 'uint256', name: 'masterTokenId', type: 'uint256' },
      { indexed: true, internalType: 'address', name: 'buyer', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'expiry', type: 'uint256' },
    ],
    name: 'LicensePurchased',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'tokenId', type: 'uint256' },
      { indexed: true, internalType: 'address', name: 'artist', type: 'address' },
      { indexed: false, internalType: 'string', name: 'tokenURI', type: 'string' },
      { indexed: false, internalType: 'uint256', name: 'price', type: 'uint256' },
    ],
    name: 'MasterMinted',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [{ indexed: false, internalType: 'uint256', name: '_tokenId', type: 'uint256' }],
    name: 'MetadataUpdate',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'previousOwner', type: 'address' },
      { indexed: true, internalType: 'address', name: 'newOwner', type: 'address' },
    ],
    name: 'OwnershipTransferred',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'masterTokenId', type: 'uint256' },
      { indexed: false, internalType: 'uint256', name: 'newPrice', type: 'uint256' },
    ],
    name: 'PriceUpdated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'from', type: 'address' },
      { indexed: true, internalType: 'address', name: 'to', type: 'address' },
      { indexed: true, internalType: 'uint256', name: 'tokenId', type: 'uint256' },
    ],
    name: 'Transfer',
    type: 'event',
  },
  {
    inputs: [
      { internalType: 'address', name: 'to', type: 'address' },
      { internalType: 'uint256', name: 'tokenId', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: '', type: 'address' },
      { internalType: 'string', name: '', type: 'string' },
    ],
    name: 'artistSongs',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'licenseId', type: 'uint256' }],
    name: 'burnExpiredLicense',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'getApproved',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getTotalMasters',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'artist', type: 'address' },
      { internalType: 'string', name: 'songTitle', type: 'string' },
    ],
    name: 'hasSong',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'user', type: 'address' },
      { internalType: 'uint256', name: 'masterTokenId', type: 'uint256' },
    ],
    name: 'hasValidLicense',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'owner', type: 'address' },
      { internalType: 'address', name: 'operator', type: 'address' },
    ],
    name: 'isApprovedForAll',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'licensePeriod',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    name: 'licenses',
    outputs: [
      { internalType: 'uint256', name: 'masterTokenId', type: 'uint256' },
      { internalType: 'address', name: 'licensee', type: 'address' },
      { internalType: 'uint256', name: 'expiry', type: 'uint256' },
      { internalType: 'bool', name: 'active', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    name: 'masterTokens',
    outputs: [
      { internalType: 'address', name: 'artist', type: 'address' },
      { internalType: 'string', name: 'tokenURI', type: 'string' },
      { internalType: 'uint256', name: 'price', type: 'uint256' },
      { internalType: 'uint256', name: 'totalSold', type: 'uint256' },
      { internalType: 'bool', name: 'active', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'artist', type: 'address' },
      { internalType: 'string', name: 'tokenURI', type: 'string' },
      { internalType: 'string', name: 'songTitle', type: 'string' },
      { internalType: 'uint256', name: 'price', type: 'uint256' },
    ],
    name: 'mintMaster',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'name',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'owner',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'ownerOf',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'masterTokenId', type: 'uint256' }],
    name: 'purchaseLicense',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'licenseId', type: 'uint256' }],
    name: 'renewLicense',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'renounceOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'from', type: 'address' },
      { internalType: 'address', name: 'to', type: 'address' },
      { internalType: 'uint256', name: 'tokenId', type: 'uint256' },
    ],
    name: 'safeTransferFrom',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'from', type: 'address' },
      { internalType: 'address', name: 'to', type: 'address' },
      { internalType: 'uint256', name: 'tokenId', type: 'uint256' },
      { internalType: 'bytes', name: 'data', type: 'bytes' },
    ],
    name: 'safeTransferFrom',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'operator', type: 'address' },
      { internalType: 'bool', name: 'approved', type: 'bool' },
    ],
    name: 'setApprovalForAll',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'bytes4', name: 'interfaceId', type: 'bytes4' }],
    name: 'supportsInterface',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'masterTokenId', type: 'uint256' }],
    name: 'toggleSales',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'tokenURI',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'toursToken',
    outputs: [{ internalType: 'contract IERC20', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'from', type: 'address' },
      { internalType: 'address', name: 'to', type: 'address' },
      { internalType: 'uint256', name: 'tokenId', type: 'uint256' },
    ],
    name: 'transferFrom',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'newOwner', type: 'address' }],
    name: 'transferOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'treasury',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'treasuryFee',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'masterTokenId', type: 'uint256' },
      { internalType: 'uint256', name: 'newPrice', type: 'uint256' },
    ],
    name: 'updatePrice',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: '', type: 'address' },
      { internalType: 'uint256', name: '', type: 'uint256' },
    ],
    name: 'userLicenses',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const ERC20_ABI = [
  {
    inputs: [
      { internalType: 'string', name: 'name', type: 'string' },
      { internalType: 'string', name: 'symbol', type: 'string' },
    ],
    stateMutability: 'nonpayable',
    type: 'constructor',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'owner', type: 'address' },
      { indexed: true, internalType: 'address', name: 'spender', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'value', type: 'uint256' },
    ],
    name: 'Approval',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'previousOwner', type: 'address' },
      { indexed: true, internalType: 'address', name: 'newOwner', type: 'address' },
    ],
    name: 'OwnershipTransferred',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'from', type: 'address' },
      { indexed: true, internalType: 'address', name: 'to', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'value', type: 'uint256' },
    ],
    name: 'Transfer',
    type: 'event',
  },
  {
    inputs: [
      { internalType: 'address', name: 'owner', type: 'address' },
      { internalType: 'address', name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'spender', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ internalType: 'uint8', name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'spender', type: 'address' },
      { internalType: 'uint256', name: 'subtractedValue', type: 'uint256' },
    ],
    name: 'decreaseAllowance',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'spender', type: 'address' },
      { internalType: 'uint256', name: 'addedValue', type: 'uint256' },
    ],
    name: 'increaseAllowance',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'to', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
    ],
    name: 'mint',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'name',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'owner',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'renounceOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'to', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'from', type: 'address' },
      { internalType: 'address', name: 'to', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
    ],
    name: 'transferFrom',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'newOwner', type: 'address' }],
    name: 'transferOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

// Interfaces for type safety
interface MusicMetadata {
  name?: string;
  description?: string;
  image?: string;
  animation_url?: string;
  external_url?: string;
  attributes?: Array<{ trait_type: string; value: any }>;
}

interface MusicNFT {
  id: string;
  tokenId: number;
  artist: string;
  owner: string;
  tokenURI: string;
  mintedAt: string;
  txHash: string;
}

interface ArtistMusic {
  tokenId: number;
  tokenURI: string;
  mintedAt: string;
  txHash: string;
  metadata?: MusicMetadata;
  price?: string;
  isLoadingMetadata?: boolean;
}

interface ArtistInfo {
  address: string;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
  fid?: number;
}

interface GraphQLResponse {
  data?: {
    MusicNFT: MusicNFT[];
  };
  errors?: Array<{ message: string }>;
}

// Helper to resolve IPFS URLs
const resolveIPFS = (url: string): string => {
  if (!url) return '';
  if (url.startsWith('ipfs://')) {
    return url.replace('ipfs://', `https://${PINATA_GATEWAY}/ipfs/`);
  }
  return url;
};

export default function ArtistProfilePage() {
  const params = useParams();
  const router = useRouter();
  const artistAddress = params.address as string;
  const { user, walletAddress, isMobile, requestWallet } = useFarcasterContext();

  const [artistMusic, setArtistMusic] = useState<ArtistMusic[]>([]);
  const [artistInfo, setArtistInfo] = useState<ArtistInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [buying, setBuying] = useState<number | null>(null);

  useEffect(() => {
    if (artistAddress && isAddress(artistAddress)) {
      loadArtistProfile();
      loadArtistInfo();
    } else {
      console.error('Invalid artist address:', artistAddress);
      setArtistInfo(null);
      setArtistMusic([]);
    }
  }, [artistAddress]);

  // ✅ IMPROVED: Better Farcaster user lookup with multiple strategies
  const loadArtistInfo = async () => {
    try {
      console.log('👤 Fetching artist info for:', artistAddress);
      const neynarApiKey = process.env.NEXT_PUBLIC_NEYNAR_API_KEY || '';

      // Strategy 1: Try by_verification endpoint
      try {
        const response1 = await fetch(
          `https://api.neynar.com/v2/farcaster/user/by_verification?address=${artistAddress}`,
          {
            headers: { 'api_key': neynarApiKey },
          }
        );
        if (response1.ok) {
          const data = await response1.json();
          if (data && data.user) {
            console.log('✅ Found Farcaster user via verification:', data.user.username);
            setArtistInfo({
              address: artistAddress,
              username: data.user.username,
              displayName: data.user.display_name || data.user.username,
              pfpUrl: data.user.pfp_url,
              fid: data.user.fid,
            });
            return;
          }
        }
      } catch (err) {
        console.warn('⚠️ Strategy 1 (by_verification) failed:', err);
      }

      // Strategy 2: Search by connected address in user data
      try {
        const response2 = await fetch(
          `https://api.neynar.com/v2/farcaster/user/search?q=${artistAddress}&limit=1`,
          {
            headers: { 'api_key': neynarApiKey },
          }
        );
        if (response2.ok) {
          const data = await response2.json();
          if (data?.result?.users && data.result.users.length > 0) {
            const user = data.result.users[0];
            // Check if this user has the address verified
            const hasAddress = user.verified_addresses?.eth_addresses?.some(
              (addr: string) => addr.toLowerCase() === artistAddress.toLowerCase()
            ) || user.custody_address?.toLowerCase() === artistAddress.toLowerCase();

            if (hasAddress) {
              console.log('✅ Found Farcaster user via search:', user.username);
              setArtistInfo({
                address: artistAddress,
                username: user.username,
                displayName: user.display_name || user.username,
                pfpUrl: user.pfp_url,
                fid: user.fid,
              });
              return;
            }
          }
        }
      } catch (err) {
        console.warn('⚠️ Strategy 2 (search) failed:', err);
      }

      // Fallback: No Farcaster user found, use address
      console.warn('⚠️ Artist not found on Farcaster, using address');
      setArtistInfo({
        address: artistAddress,
        username: `${artistAddress.slice(0, 6)}...${artistAddress.slice(-4)}`,
        displayName: `Artist ${artistAddress.slice(0, 6)}...${artistAddress.slice(-4)}`,
      });
    } catch (error) {
      console.error('❌ Error loading artist info:', error);
      setArtistInfo({
        address: artistAddress,
        username: `${artistAddress.slice(0, 6)}...${artistAddress.slice(-4)}`,
        displayName: `Artist ${artistAddress.slice(0, 6)}...${artistAddress.slice(-4)}`,
      });
    }
  };

  const loadArtistProfile = async () => {
    setLoading(true);
    try {
      const query = `
        query GetArtistMusic($address: String!) {
          MusicNFT(
            where: {artist: {_eq: $address}},
            order_by: {mintedAt: desc},
            limit: 50
          ) {
            id
            tokenId
            artist
            owner
            tokenURI
            mintedAt
            txHash
          }
        }
      `;
      const response = await fetch(ENVIO_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          variables: { address: artistAddress.toLowerCase() },
        }),
      });
      if (!response.ok) {
        throw new Error(`Envio API error: ${response.status}`);
      }
      const result: GraphQLResponse = await response.json();
      if (result.errors) {
        throw new Error(`GraphQL errors: ${result.errors.map((e) => e.message).join(', ')}`);
      }
      const music = result.data?.MusicNFT || [];
      console.log('✅ Loaded', music.length, 'tracks from artist', artistAddress);

      const musicWithLoading: ArtistMusic[] = music.map((m) => ({
        ...m,
        isLoadingMetadata: true,
      }));
      setArtistMusic(musicWithLoading);

      // Batch fetch metadata and on-chain prices
      const metadataAndPricePromises = music.map(async (nft: MusicNFT, index: number) => {
        try {
          // Fetch on-chain price
          const tokenData = await client.readContract({
            address: MUSIC_NFT_ADDRESS as `0x${string}`,
            abi: MUSIC_NFT_ABI,
            functionName: 'masterTokens',
            args: [BigInt(nft.tokenId)],
          });
          const onChainPrice = Number(tokenData[2]) / 1e18; // price field (index 2)

          // Fetch metadata
          const metadataUrl = resolveIPFS(nft.tokenURI);
          console.log(`📦 Fetching metadata for token ${nft.tokenId}:`, metadataUrl);
          const metadataRes = await fetch(metadataUrl, { signal: AbortSignal.timeout(5000) });
          if (!metadataRes.ok) {
            throw new Error(`Failed to fetch metadata: ${metadataRes.status}`);
          }
          const metadata: MusicMetadata = await metadataRes.json();
          console.log(`✅ Metadata loaded for token ${nft.tokenId}:`, metadata.name);

          return { index, metadata, price: onChainPrice.toString(), isLoadingMetadata: false };
        } catch (error) {
          console.error(`❌ Error loading metadata or price for token ${nft.tokenId}:`, error);
          return { index, metadata: undefined, price: '0.01', isLoadingMetadata: false };
        }
      });

      const metadataAndPriceResults = await Promise.all(metadataAndPricePromises);
      setArtistMusic((prev) => {
        const updated = [...prev];
        metadataAndPriceResults.forEach(({ index, metadata, price, isLoadingMetadata }) => {
          updated[index] = { ...updated[index], metadata, price, isLoadingMetadata };
        });
        return updated;
      });
    } catch (error: any) {
      console.error('❌ Error loading artist profile:', {
        message: error.message,
        stack: error.stack,
        artistAddress,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBuyLicense = async (music: ArtistMusic) => {
    if (!walletAddress) {
      alert('🔑 Please connect your wallet first');
      await requestWallet();
      return;
    }
    if (walletAddress.toLowerCase() === artistAddress.toLowerCase()) {
      alert('❌ You cannot buy your own music!');
      return;
    }
    setBuying(music.tokenId);
    try {
      console.log('🎵 Buying music license via bot command');
      // Use delegation system via bot command
      const command = `buy music ${music.tokenId} from @${artistInfo?.username || artistAddress}`;
      
      const response = await fetch('/api/bot-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command,
          userAddress: walletAddress,
          location: null,
        }),
      });
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Purchase failed');
      }
      alert(`🎉 Buying "${music.metadata?.name || 'track'}"!\n\nPrice: ${music.price} TOURS\n\nTX: ${result.txHash}`);
      
      setTimeout(() => loadArtistProfile(), 2000);
      
    } catch (error: any) {
      alert(`❌ Purchase failed: ${error.message}`);
    } finally {
      setBuying(null);
    }
  };

  if (loading && artistMusic.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">⏳</div>
          <p className="text-gray-600">Loading artist profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Artist Header */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
          <div className="flex items-center gap-6 mb-6">
            {artistInfo?.pfpUrl ? (
              <img
                src={artistInfo.pfpUrl}
                alt={artistInfo.username || 'Artist'}
                className="w-24 h-24 rounded-full border-2 border-purple-300 shadow-lg object-cover"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-4xl font-bold shadow-lg">
                🎵
              </div>
            )}
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                {artistInfo?.displayName || 'Loading...'}
              </h1>
              {artistInfo?.username && (
                <p className="text-gray-600 text-lg mb-2">
                  @{artistInfo.username}
                </p>
              )}
              <p className="text-gray-600 font-mono text-sm">
                {artistAddress.slice(0, 10)}...{artistAddress.slice(-8)}
              </p>
              <div className="flex gap-3 mt-4">
                <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">
                  🎵 {artistMusic.length} Tracks
                </span>
                <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                  ⚡ Live on Monad
                </span>
              </div>
            </div>
          </div>

          {isMobile && !walletAddress && (
            <div className="mb-6 p-4 bg-yellow-50 border-2 border-yellow-200 rounded-lg">
              <p className="text-yellow-900 text-sm font-medium mb-2">
                📱 Mobile: Using Farcaster Wallet
              </p>
              <p className="text-yellow-700 text-xs">
                Transactions will use your Farcaster custody address. Make sure it has TOURS tokens + MON for gas.
              </p>
              {!walletAddress && (
                <button
                  onClick={requestWallet}
                  className="mt-3 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 text-sm font-medium"
                >
                  🔑 Connect Wallet
                </button>
              )}
            </div>
          )}

          {walletAddress && (
            <div className="p-4 bg-green-50 border-2 border-green-200 rounded-lg">
              <p className="text-green-900 text-sm">
                ✅ <strong>Connected:</strong>{' '}
                <span className="font-mono text-xs">
                  {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                </span>
              </p>
              {isMobile && (
                <p className="text-green-700 text-xs mt-1">
                  📱 Using Farcaster custody address
                </p>
              )}
            </div>
          )}
        </div>

        {/* Music Catalog */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            🎵 Music Catalog
          </h2>
          {artistMusic.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl">
              <div className="text-6xl mb-4">🎵</div>
              <p className="text-gray-600 text-lg">No music available yet</p>
              <p className="text-gray-500 text-sm mt-2">This artist hasn't minted any music NFTs</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {artistMusic.map((music) => (
                <div
                  key={music.tokenId}
                  className="bg-white border-2 border-gray-200 rounded-xl hover:border-purple-400 transition-all shadow-sm hover:shadow-lg"
                >
                  {music.metadata?.image ? (
                    <div className="w-full aspect-square overflow-hidden rounded-t-xl">
                      <img
                        src={resolveIPFS(music.metadata.image)}
                        alt={music.metadata.name || `Track #${music.tokenId}`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          console.error('Failed to load image:', music.metadata?.image);
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>
                  ) : music.isLoadingMetadata ? (
                    <div className="w-full aspect-square bg-gradient-to-br from-purple-200 to-pink-200 flex items-center justify-center rounded-t-xl">
                      <div className="text-center">
                        <div className="animate-spin text-4xl mb-2">⏳</div>
                        <p className="text-sm text-gray-600">Loading...</p>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full aspect-square bg-gradient-to-br from-purple-200 to-pink-200 flex items-center justify-center rounded-t-xl">
                      <span className="text-7xl">🎵</span>
                    </div>
                  )}
                  <div className="p-5 space-y-3">
                    <div>
                      <p className="font-bold text-gray-900 text-lg truncate">
                        {music.metadata?.name || `Track #${music.tokenId}`}
                      </p>
                      <p className="text-sm text-gray-600">
                        Minted {new Date(music.mintedAt).toLocaleDateString()}
                      </p>
                    </div>
                    {music.isLoadingMetadata ? (
                      <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 text-center">
                        <p className="text-xs text-gray-500">Loading audio...</p>
                      </div>
                    ) : music.metadata?.animation_url ? (
                      <div className="bg-gray-50 rounded-lg p-2 border border-gray-200">
                        <audio
                          controls
                          preload="metadata"
                          className="w-full"
                          style={{ height: '40px' }}
                        >
                          <source
                            src={resolveIPFS(music.metadata.animation_url)}
                            type="audio/mpeg"
                          />
                          <source
                            src={resolveIPFS(music.metadata.animation_url)}
                            type="audio/wav"
                          />
                        </audio>
                        <p className="text-xs text-gray-500 text-center mt-1">
                          Preview only - Buy to own
                        </p>
                      </div>
                    ) : (
                      <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 text-center">
                        <p className="text-xs text-gray-500">No preview available</p>
                      </div>
                    )}
                    <div className="pt-3 border-t border-gray-200">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-xs text-gray-600">License Price</p>
                          <p className="text-2xl font-bold text-purple-600">
                            {music.price || '0.01'} TOURS
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-600">+10% Royalties</p>
                          <p className="text-xs text-gray-500">to artist</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleBuyLicense(music)}
                        disabled={
                          buying === music.tokenId ||
                          !walletAddress ||
                          walletAddress.toLowerCase() === artistAddress.toLowerCase()
                        }
                        className="w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-bold hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 touch-manipulation"
                        style={{ minHeight: '56px' }}
                      >
                        {buying === music.tokenId
                          ? '⏳ Processing...'
                          : walletAddress?.toLowerCase() === artistAddress.toLowerCase()
                          ? '❌ Your Own Track'
                          : `🛒 Buy License (${music.price || '0.01'} TOURS)`
                        }
                      </button>
                      {music.txHash && (
                        <a
                          href={`https://testnet.monadexplorer.com/tx/${music.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-center text-xs text-gray-500 hover:text-purple-600 mt-2"
                        >
                          View Mint TX →
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* How It Works */}
        <div className="mt-12 p-6 bg-gradient-to-r from-purple-100 to-pink-100 rounded-2xl border-2 border-purple-200">
          <h3 className="font-bold text-gray-900 mb-3">💡 How Music Licenses Work:</h3>
          <ul className="space-y-2 text-sm text-gray-700">
            <li>✅ <strong>Preview:</strong> Listen to 30s preview for free</li>
            <li>💰 <strong>Buy License:</strong> Pay in TOURS tokens to access full track forever</li>
            <li>🎵 <strong>Artist Royalties:</strong> 10% royalties on all sales go to the artist</li>
            <li>⚡ <strong>Instant Access:</strong> Full track unlocked immediately after purchase</li>
            <li>🪙 <strong>Payment:</strong> Uses TOURS tokens (not ETH) - swap MON for TOURS in Market</li>
          </ul>
          <p className="text-xs text-gray-600 mt-4">
            💡 <strong>Tip:</strong> Support artists directly! All purchases go straight to the artist's wallet.
          </p>
        </div>

        <div className="mt-8 text-center">
          <Link
            href="/profile"
            className="inline-block px-6 py-3 bg-gray-600 text-white rounded-lg font-medium hover:bg-gray-700 transition-all"
          >
            ← Back to My Profile
          </Link>
        </div>
      </div>
    </div>
  );
}
