'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { Interface, parseEther } from 'ethers';
import Link from 'next/link';

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'http://localhost:8080/v1/graphql';
const PINATA_GATEWAY = 'https://harlequin-used-hare-224.mypinata.cloud/ipfs/';

// ✅ UPDATED CONTRACT ADDRESS
const MUSIC_NFT_ADDRESS = '0x33c3Cae53e6E5a0D5a7f7257f2eFC4Ca9c3dFEAc';

// Minimal ABI for buying music
const MUSIC_NFT_ABI = [
  {
    inputs: [
      { internalType: 'uint256', name: 'tokenId', type: 'uint256' },
      { internalType: 'address', name: 'buyer', type: 'address' }
    ],
    name: 'purchaseLicense',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
];

// Helper to resolve IPFS URLs
const resolveIPFS = (url: string) => {
  if (!url) return '';
  if (url.startsWith('ipfs://')) {
    return url.replace('ipfs://', PINATA_GATEWAY);
  }
  return url;
};

interface MusicMetadata {
  name?: string;
  description?: string;
  image?: string;
  animation_url?: string;
  external_url?: string;
  attributes?: Array<{ trait_type: string; value: any }>;
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

export default function ArtistProfilePage() {
  const params = useParams();
  const artistAddress = params.address as string;
  const { user, walletAddress, isMobile, requestWallet, sendTransaction, switchChain } = useFarcasterContext();
  
  const [artistMusic, setArtistMusic] = useState<ArtistMusic[]>([]);
  const [artistInfo, setArtistInfo] = useState<ArtistInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [buying, setBuying] = useState<number | null>(null);

  useEffect(() => {
    if (artistAddress) {
      loadArtistProfile();
      loadArtistInfo();
    }
  }, [artistAddress]);

  // Fetch artist info from Neynar
  const loadArtistInfo = async () => {
    try {
      console.log('👤 Fetching artist info for:', artistAddress);
      const response = await fetch(
        `https://api.neynar.com/v2/farcaster/user/by_verification?address=${artistAddress}`,
        {
          headers: {
            'api_key': process.env.NEXT_PUBLIC_NEYNAR_API_KEY || '',
          },
        }
      );
      if (response.ok) {
        const data = await response.json();
        if (data && data.fid) {
          console.log('✅ Found Farcaster user:', data.username);
          setArtistInfo({
            address: artistAddress,
            username: data.username,
            displayName: data.display_name || data.username,
            pfpUrl: data.pfp_url,
            fid: data.fid,
          });
          return;
        }
      }
      console.log('⚠️ Artist not found on Farcaster, using address');
      setArtistInfo({
        address: artistAddress,
        username: `artist_${artistAddress.slice(2, 8)}`,
        displayName: `Artist ${artistAddress.slice(0, 6)}...${artistAddress.slice(-4)}`,
      });
    } catch (error) {
      console.error('❌ Error loading artist info:', error);
      setArtistInfo({
        address: artistAddress,
        username: `artist_${artistAddress.slice(2, 8)}`,
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
          variables: { address: artistAddress.toLowerCase() }
        }),
      });
      if (!response.ok) throw new Error('Failed to load artist music');
      const result = await response.json();
      const music = result.data?.MusicNFT || [];
      console.log('✅ Loaded', music.length, 'tracks from artist', artistAddress);
      
      const musicWithLoading: ArtistMusic[] = music.map((m: any) => ({
        ...m,
        isLoadingMetadata: true,
      }));
      setArtistMusic(musicWithLoading);
      
      music.forEach(async (nft: any, index: number) => {
        try {
          const metadataUrl = resolveIPFS(nft.tokenURI);
          console.log(`📦 Fetching metadata for token ${nft.tokenId}:`, metadataUrl);
          const metadataRes = await fetch(metadataUrl);
          if (!metadataRes.ok) {
            throw new Error(`Failed to fetch metadata: ${metadataRes.status}`);
          }
          const metadata: MusicMetadata = await metadataRes.json();
          console.log(`✅ Metadata loaded for token ${nft.tokenId}:`, metadata.name);
          
          const priceAttr = metadata.attributes?.find(
            (attr) => attr.trait_type === 'License Price' || attr.trait_type === 'Price'
          );
          const price = priceAttr?.value || '0.01';
          
          setArtistMusic((prev) => {
            const updated = [...prev];
            updated[index] = {
              ...updated[index],
              metadata,
              price: price.toString(),
              isLoadingMetadata: false,
            };
            return updated;
          });
        } catch (error) {
          console.error(`❌ Error loading metadata for token ${nft.tokenId}:`, error);
          setArtistMusic((prev) => {
            const updated = [...prev];
            updated[index] = {
              ...updated[index],
              isLoadingMetadata: false,
              price: '0.01',
            };
            return updated;
          });
        }
      });
    } catch (error: any) {
      console.error('❌ Error loading artist profile:', error);
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
      console.log('🎵 Buying music license...', {
        tokenId: music.tokenId,
        price: music.price,
        buyer: walletAddress,
        artist: artistAddress,
        isMobile
      });

      await switchChain({ chainId: 10143 });

      const iface = new Interface(MUSIC_NFT_ABI);
      const data = iface.encodeFunctionData('purchaseLicense', [music.tokenId, walletAddress]);

      const tx = await sendTransaction({
        to: MUSIC_NFT_ADDRESS,
        value: parseEther(music.price || '0.01'),
        data,
        gasLimit: 300000
      });

      console.log('📤 Purchase transaction sent:', tx.hash);
      alert(`⏳ Transaction submitted!\n\nTX: ${tx.hash.slice(0, 10)}...\n\nWaiting for confirmation...`);

      await tx.wait();
      alert(`🎉 Music License Purchased!\n\n✅ You can now listen to "${music.metadata?.name || 'this track'}"\n\nTX: ${tx.hash}`);
      
      setTimeout(loadArtistProfile, 2000);
    } catch (error: any) {
      console.error('❌ Purchase error:', error);
      if (error.message?.includes('user rejected') || error.code === 4001) {
        alert('❌ Transaction cancelled by user');
      } else if (error.message?.includes('insufficient')) {
        alert('❌ Insufficient funds. You need ' + (music.price || '0.01') + ' ETH + gas fees.');
      } else {
        alert(`❌ Purchase failed: ${error.message || 'Unknown error'}`);
      }
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
                Transactions will use your Farcaster custody address. Make sure it has MON for gas fees.
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
                            {music.price || '0.01'} ETH
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
                          ? '⏳ Purchasing...'
                          : walletAddress?.toLowerCase() === artistAddress.toLowerCase()
                          ? '❌ Your Own Track'
                          : `🛒 Buy License (${music.price || '0.01'} ETH)`
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

        <div className="mt-12 p-6 bg-gradient-to-r from-purple-100 to-pink-100 rounded-2xl border-2 border-purple-200">
          <h3 className="font-bold text-gray-900 mb-3">💡 How Music Licenses Work:</h3>
          <ul className="space-y-2 text-sm text-gray-700">
            <li>✅ <strong>Preview:</strong> Listen to 30s preview for free</li>
            <li>💰 <strong>Buy License:</strong> Pay once to access full track forever</li>
            <li>🎵 <strong>Artist Royalties:</strong> 10% royalties on all sales go to the artist</li>
            <li>⚡ <strong>Instant Access:</strong> Full track unlocked immediately after purchase</li>
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
