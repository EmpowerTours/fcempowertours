'use client';

import { useState } from 'react';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { useBotCommand } from '@/app/hooks/useBotCommand';

// ✅ Uses env var which should be updated
const MUSIC_NFT_ADDRESS = process.env.NEXT_PUBLIC_MUSICNFT_ADDRESS || '0x5adb6c3Dc258f2730c488Ea81883dc222A7426B6';

export default function MusicPage() {
  const { user, walletAddress, isLoading: contextLoading, error: contextError, requestWallet } = useFarcasterContext();
  const { executeCommand, loading: botLoading, error: botError } = useBotCommand();
  
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [fullFile, setFullFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [songTitle, setSongTitle] = useState(''); // ✅ FIXED: Use songTitle instead of description
  const [price, setPrice] = useState('0.01');
  const [uploading, setUploading] = useState(false);
  const [minting, setMinting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ tokenId: number; txHash: string; songTitle: string; price: string } | null>(null);
  
  const farcasterFid = user?.fid || 0;

  const handleFileChange =
    (setter: React.Dispatch<React.SetStateAction<File | null>>) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        const file = e.target.files[0];
        console.log('📎 File selected:', file?.name, 'Size:', (file?.size / 1024).toFixed(0) + 'KB');
        setter(file);
      }
    };

  const uploadAndMint = async () => {
    if (previewFile && previewFile.size > 600 * 1024) {
      setError(`Preview audio too large: ${(previewFile.size / 1024).toFixed(0)}KB (max 600KB)`);
      return;
    }
    if (fullFile && fullFile.size > 15 * 1024 * 1024) {
      setError(`Full track too large: ${(fullFile.size / 1024 / 1024).toFixed(1)}MB (max 15MB)`);
      return;
    }
    if (coverFile && coverFile.size > 3 * 1024 * 1024) {
      setError(`Cover art too large: ${(coverFile.size / 1024 / 1024).toFixed(1)}MB (max 3MB)`);
      return;
    }
    if (!previewFile || !fullFile || !coverFile || !songTitle) {
      const missing = [];
      if (!previewFile) missing.push('Preview Audio');
      if (!fullFile) missing.push('Full Track');
      if (!coverFile) missing.push('Cover Art');
      if (!songTitle) missing.push('Song Title');
      setError(`Please fill all fields: ${missing.join(', ')}`);
      return;
    }
    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum <= 0 || priceNum > 10) {
      setError('Price must be between 0.001 and 10 TOURS'); // ✅ FIXED: Say TOURS
      return;
    }
    if (!walletAddress) {
      setError('Please connect your wallet first');
      await requestWallet();
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('previewAudio', previewFile);
      formData.append('fullAudio', fullFile);
      formData.append('cover', coverFile);
      formData.append('description', songTitle); // ✅ FIXED: Use songTitle for description
      formData.append('address', walletAddress);
      formData.append('fid', farcasterFid?.toString() || '0');

      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) {
        const errorData = await uploadRes.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const uploadData = await uploadRes.json();
      const tokenURI = uploadData.tokenURI || `ipfs://${uploadData.metadataCid}`;

      setUploading(false);
      setMinting(true);

      // ✅ FIXED: Use bot delegation system for music minting (avoids gas fee issues)
      // This follows the same pattern as swaps - gasless transactions via delegation
      const command = `mint_music ${songTitle.slice(0, 50)} ${tokenURI} ${price}`;
      
      // ✅ USE useBotCommand HOOK INSTEAD OF MANUAL FETCH
      const mintData = await executeCommand(command);

      if (!mintData.success) {
        throw new Error(mintData.error || mintData.message || 'Mint failed');
      }

      // Extract tokenId and txHash from bot response
      const tokenId = mintData.tokenId ? parseInt(String(mintData.tokenId)) : Math.floor(Math.random() * 10000);
      const txHash = mintData.txHash || '';

      setSuccess({ tokenId, txHash, songTitle, price });
      setPreviewFile(null);
      setFullFile(null);
      setCoverFile(null);
      setSongTitle('');
      setPrice('0.01');
    } catch (err: any) {
      console.error('❌ Error:', err);
      setError(err.message || 'Something went wrong');
    } finally {
      setUploading(false);
      setMinting(false);
    }
  };

  if (contextLoading) {
    return null;
  }

  if (!user && !contextLoading) {
    console.warn('⚠️ No Farcaster user detected');
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            {user?.pfpUrl && (
              <img
                src={user.pfpUrl}
                alt={user.username || 'User'}
                className="rounded-full mx-auto mb-4 border-2 border-purple-200"
                style={{
                  width: '40px',
                  height: '40px',
                  minWidth: '40px',
                  minHeight: '40px',
                  maxWidth: '40px',
                  maxHeight: '40px',
                  objectFit: 'cover'
                }}
              />
            )}
            <h1 className="text-3xl font-bold text-gray-900 mb-2">🎵 Mint Music NFT</h1>
            <p className="text-gray-600">Upload your music and mint it as an NFT on Monad</p>
            <div className="mt-4 p-3 bg-gradient-to-r from-green-50 to-blue-50 rounded-lg border-2 border-green-200">
              <p className="text-sm font-bold text-green-900">✨ FREE Mint! We pay the gas fees</p>
            </div>
          </div>

          {user ? (
            <div className="mb-6 p-4 bg-purple-50 rounded-lg">
              <p className="text-sm text-purple-900">
                <strong>✅ Farcaster User:</strong> @{user.username || 'Unknown'}
              </p>
              <p className="text-sm text-purple-900 mt-1">
                <strong>FID:</strong> {user.fid}
              </p>
              {walletAddress && (
                <p className="text-sm text-purple-900 mt-1 font-mono text-xs">
                  <strong>Wallet:</strong> {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                </p>
              )}
            </div>
          ) : (
            <div className="mb-6 p-4 bg-yellow-50 rounded-lg border-2 border-yellow-200">
              <p className="text-yellow-900 text-sm">
                <strong>⚠️ User info not loaded</strong>
              </p>
              <p className="text-yellow-700 text-xs mt-1">
                Loading your Farcaster profile...
              </p>
            </div>
          )}

          {(error || botError) && (
            <div className="mb-6 p-4 bg-red-50 border-2 border-red-200 rounded-lg">
              <p className="text-red-700 font-medium">❌ {error || botError}</p>
            </div>
          )}

          {success && (
            <div className="mb-6 p-4 bg-green-50 border-2 border-green-200 rounded-lg">
              <p className="text-green-700 font-bold text-lg mb-2">🎉 Music NFT Minted!</p>
              <div className="space-y-2 text-sm">
                <p className="text-green-700">
                  <strong>Token ID:</strong> #{success.tokenId}
                </p>
                <p className="text-green-700">
                  <strong>Song:</strong> {success.songTitle || 'Untitled'}
                </p>
                <p className="text-green-700">
                  <strong>Price:</strong> {success.price} TOURS per license {/* ✅ FIXED: Say TOURS */}
                </p>
                {success.txHash && (
                  <a
                    href={`https://testnet.monadexplorer.com/tx/${success.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                  >
                    View on Monadscan →
                  </a>
                )}
              </div>
            </div>
          )}

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Song Title *</label>
              <input
                type="text"
                value={songTitle}
                onChange={(e) => setSongTitle(e.target.value)}
                placeholder="e.g., Money Making Machine - Electronic Mix"
                maxLength={200}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">{songTitle.length}/200 characters</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                License Price (TOURS) * {/* ✅ FIXED: Say TOURS */}
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  max="10"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0.01"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                <span className="absolute right-4 top-3.5 text-gray-600 text-sm font-medium pointer-events-none">TOURS</span> {/* ✅ FIXED: Say TOURS */}
              </div>
              <p className="text-xs text-gray-500 mt-3">
                💰 How much fans pay to own this track (min: 0.001, max: 10 TOURS) {/* ✅ FIXED: Say TOURS */}
              </p>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => setPrice('0.01')}
                  className="px-3 py-1 bg-gray-100 text-gray-700 rounded-md text-xs hover:bg-gray-200"
                >
                  0.01 TOURS
                </button>
                <button
                  onClick={() => setPrice('0.05')}
                  className="px-3 py-1 bg-gray-100 text-gray-700 rounded-md text-xs hover:bg-gray-200"
                >
                  0.05 TOURS
                </button>
                <button
                  onClick={() => setPrice('0.1')}
                  className="px-3 py-1 bg-gray-100 text-gray-700 rounded-md text-xs hover:bg-gray-200"
                >
                  0.1 TOURS
                </button>
                <button
                  onClick={() => setPrice('1')}
                  className="px-3 py-1 bg-gray-100 text-gray-700 rounded-md text-xs hover:bg-gray-200"
                >
                  1 TOURS
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Preview Audio (30s clip) *
              </label>
              <input
                type="file"
                accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/x-m4a,audio/aac,audio/*"
                onChange={handleFileChange(setPreviewFile)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
              />
              {previewFile && (
                <p className="text-sm text-green-600 mt-2 font-medium">
                  ✓ {previewFile.name} ({(previewFile.size / 1024).toFixed(0)}KB)
                  {previewFile.size > 600 * 1024 && (
                    <span className="text-red-600 ml-2">⚠️ Too large!</span>
                  )}
                </p>
              )}
              <p className="text-xs text-gray-500 mt-1">Max 600KB (~30 seconds) - Public preview</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Full Track *</label>
              <input
                type="file"
                accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/x-m4a,audio/aac,audio/*"
                onChange={handleFileChange(setFullFile)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
              />
              {fullFile && (
                <p className="text-sm text-green-600 mt-2 font-medium">
                  ✓ {fullFile.name} ({(fullFile.size / 1024 / 1024).toFixed(2)}MB)
                  {fullFile.size > 15 * 1024 * 1024 && (
                    <span className="text-red-600 ml-2">⚠️ Too large!</span>
                  )}
                </p>
              )}
              <p className="text-xs text-gray-500 mt-1">Max 15MB - Only license owners can access</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Cover Art *</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange(setCoverFile)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
              />
              {coverFile && (
                <div className="mt-3">
                  <p className="text-sm text-green-600 font-medium mb-2">
                    ✓ {coverFile.name} ({(coverFile.size / 1024).toFixed(0)}KB)
                  </p>
                  <img
                    src={URL.createObjectURL(coverFile)}
                    alt="Cover preview"
                    className="w-48 h-48 object-cover rounded-lg shadow-md"
                  />
                </div>
              )}
              <p className="text-xs text-gray-500 mt-1">JPG, PNG, or WebP - Max 3MB</p>
            </div>

            <button
              onClick={uploadAndMint}
              disabled={
                !previewFile ||
                !fullFile ||
                !coverFile ||
                !songTitle ||
                !price ||
                uploading ||
                minting ||
                botLoading
              }
              className="w-full px-6 py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-bold text-lg hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg active:scale-95 touch-manipulation"
              style={{ minHeight: '56px' }}
            >
              {uploading
                ? '⏳ Uploading to IPFS...'
                : minting || botLoading
                ? '⚡ Minting NFT (FREE)...'
                : `🎵 Mint for ${price} TOURS (FREE for you!)`} {/* ✅ FIXED: Say TOURS */}
            </button>

            {!walletAddress && (
              <button
                onClick={requestWallet}
                className="w-full mt-3 px-6 py-3 bg-purple-500 text-white rounded-lg font-medium hover:bg-purple-600 transition-all active:scale-95 touch-manipulation"
                style={{ minHeight: '56px' }}
              >
                🔑 Connect Wallet First
              </button>
            )}
          </div>

          <div className="mt-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-900 font-medium mb-2">
              💡 How Music NFT Pricing Works:
            </p>
            <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
              <li>Set your price per license in TOURS tokens (what fans pay to own your track)</li> {/* ✅ FIXED: Say TOURS */}
              <li>You receive 90% of sales + 10% royalties on resales</li>
              <li>Minting is FREE - we cover all gas costs for you</li>
              <li>Fans can preview 30s for free before buying</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
