'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { BrowserProvider, Contract, parseEther } from 'ethers';

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'http://localhost:8080/v1/graphql';
const PINATA_GATEWAY = 'https://harlequin-used-hare-224.mypinata.cloud/ipfs/';
const MUSIC_NFT_ADDRESS = '0xaD849874B0111131A30D7D2185Cc1519A83dd3D0';

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
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'tokenURI',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  }
];

interface ArtistMusic {
  tokenId: number;
  tokenURI: string;
  mintedAt: string;
  price: string;
  txHash: string;
}

export default function ArtistProfilePage() {
  const params = useParams();
  const artistAddress = params.address as string;

  const { user, walletAddress, isMobile, requestWallet } = useFarcasterContext();

  const [artistMusic, setArtistMusic] = useState<ArtistMusic[]>([]);
  const [artistInfo, setArtistInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [buying, setBuying] = useState<number | null>(null);

  useEffect(() => {
    if (artistAddress) {
      loadArtistProfile();
    }
  }, [artistAddress]);

  const loadArtistProfile = async () => {
    setLoading(true);
    try {
      // Query artist's music from Envio
      const query = `
        query GetArtistMusic($address: String!) {
          MusicNFT(where: {owner: {_eq: $address}}, order_by: {mintedAt: desc}, limit: 50) {
            id
            tokenId
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

      // Mock price for now (should come from smart contract)
      const musicWithPrices = music.map((m: any) => ({
        ...m,
        price: '0.01' // 0.01 ETH per license
      }));

      setArtistMusic(musicWithPrices);

      // Get artist info from Farcaster (if available)
      // For now, use address
      setArtistInfo({
        address: artistAddress,
        username: `artist_${artistAddress.slice(2, 8)}`,
      });

      console.log('✅ Loaded', music.length, 'tracks from artist');
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

    // Check if user is trying to buy their own music
    if (walletAddress.toLowerCase() === artistAddress.toLowerCase()) {
      alert('❌ You cannot buy your own music!');
      return;
    }

    // Check if window.ethereum exists
    if (typeof window.ethereum === 'undefined') {
      alert('❌ No Ethereum wallet detected. Please install MetaMask or use a Web3 browser.');
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

      // Connect to contract
      const provider = new BrowserProvider(window.ethereum as any);
      const signer = await provider.getSigner();
      const contract = new Contract(MUSIC_NFT_ADDRESS, MUSIC_NFT_ABI, signer);

      // Purchase license (not the NFT, just the license to listen)
      const tx = await contract.purchaseLicense(
        music.tokenId,
        walletAddress,
        {
          value: parseEther(music.price),
          gasLimit: 300000 // Explicit gas limit for mobile
        }
      );

      console.log('📤 Purchase transaction sent:', tx.hash);

      // Show pending state
      alert(`⏳ Transaction submitted!\n\nTX: ${tx.hash.slice(0, 10)}...\n\nWaiting for confirmation...`);

      await tx.wait();

      alert(`🎉 Music License Purchased!\n\n✅ You can now listen to this track\n\nTX: ${tx.hash}`);

      // Reload to show updated state
      setTimeout(loadArtistProfile, 2000);

    } catch (error: any) {
      console.error('❌ Purchase error:', error);

      if (error.message?.includes('user rejected') || error.code === 4001) {
        alert('❌ Transaction cancelled by user');
      } else if (error.message?.includes('insufficient')) {
        alert('❌ Insufficient funds. You need ' + music.price + ' ETH + gas fees.');
      } else {
        alert(`❌ Purchase failed: ${error.message || 'Unknown error'}`);
      }
    } finally {
      setBuying(null);
    }
  };

  if (loading) {
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
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-4xl font-bold">
              🎵
            </div>
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                {artistInfo?.username || 'Artist'}
              </h1>
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

          {/* Mobile Wallet Warning */}
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

          {/* Connected Wallet Info */}
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
                  {/* Cover Art */}
                  <div className="w-full aspect-square bg-gradient-to-br from-purple-200 to-pink-200 flex items-center justify-center rounded-t-xl">
                    <span className="text-7xl">🎵</span>
                  </div>

                  {/* Info */}
                  <div className="p-5 space-y-3">
                    <div>
                      <p className="font-bold text-gray-900 text-lg">
                        Track #{music.tokenId}
                      </p>
                      <p className="text-sm text-gray-600">
                        Minted {new Date(music.mintedAt).toLocaleDateString()}
                      </p>
                    </div>

                    {/* Audio Preview */}
                    {music.tokenURI && (
                      <div className="bg-gray-50 rounded-lg p-2">
                        <audio
                          controls
                          preload="metadata"
                          className="w-full"
                          style={{ height: '40px' }}
                        >
                          <source
                            src={music.tokenURI.startsWith('ipfs://')
                              ? music.tokenURI.replace('ipfs://', PINATA_GATEWAY)
                              : music.tokenURI}
                            type="audio/mpeg"
                          />
                        </audio>
                        <p className="text-xs text-gray-500 text-center mt-1">
                          Preview only - Buy to own
                        </p>
                      </div>
                    )}

                    {/* Price & Buy */}
                    <div className="pt-3 border-t border-gray-200">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-xs text-gray-600">License Price</p>
                          <p className="text-2xl font-bold text-purple-600">
                            {music.price} ETH
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
                          : `🛒 Buy License (${music.price} ETH)`
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

        {/* Info Banner */}
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
      </div>
    </div>
  );
}
