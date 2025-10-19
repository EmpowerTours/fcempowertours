'use client';

import { useState, useEffect } from 'react';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';

const MUSIC_NFT_ADDRESS = process.env.NEXT_PUBLIC_MUSICNFT_ADDRESS || '0xF4aa283e1372b0F96C9eA0E64Da496cA2c992bC2';

export default function MusicPage() {
  const { user, walletAddress, isLoading: contextLoading, error: contextError, requestWallet } = useFarcasterContext();

  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [fullFile, setFullFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [minting, setMinting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ tokenId: number; txHash: string } | null>(null);

  const farcasterFid = user?.fid || 0;

  // Auto-request wallet when user loads
  useEffect(() => {
    if (user && !walletAddress) {
      requestWallet();
    }
  }, [user, walletAddress, requestWallet]);

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
    if (!previewFile || !fullFile || !coverFile || !description) {
      const missing = [];
      if (!previewFile) missing.push('Preview Audio');
      if (!fullFile) missing.push('Full Track');
      if (!coverFile) missing.push('Cover Art');
      if (!description) missing.push('Song Title');
      setError(`Please fill all fields: ${missing.join(', ')}`);
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
      formData.append('description', description);
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

      const mintRes = await fetch('/api/mint-music', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: walletAddress,
          tokenURI,
          fid: farcasterFid || 0,
        }),
      });

      if (!mintRes.ok) {
        const errorData = await mintRes.json();
        throw new Error(errorData.error || 'Mint failed');
      }

      const { txHash, tokenId } = await mintRes.json();
      setSuccess({ tokenId, txHash });

      setPreviewFile(null);
      setFullFile(null);
      setCoverFile(null);
      setDescription('');
    } catch (err: any) {
      console.error('❌ Error:', err);
      setError(err.message || 'Something went wrong');
    } finally {
      setUploading(false);
      setMinting(false);
    }
  };

  if (contextLoading) {
    return null; // Don't show anything while loading - splash screen handles this
  }

  // Show warning if no user but don't block the app
  if (!user && !contextLoading) {
    console.warn('⚠️ No Farcaster user detected');
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            {user?.pfpUrl && (
              <img
                src={user.pfpUrl}
                alt={user.username || 'User'}
                className="w-16 h-16 rounded-full mx-auto mb-4 border-4 border-purple-200"
              />
            )}
            <h1 className="text-3xl font-bold text-gray-900 mb-2">🎵 Mint Music NFT</h1>
            <p className="text-gray-600">Upload your music and mint it as an NFT on Monad</p>
            <div className="mt-4 p-3 bg-gradient-to-r from-green-50 to-blue-50 rounded-lg border-2 border-green-200">
              <p className="text-sm font-bold text-green-900">✨ FREE Mint! We pay the gas fees</p>
            </div>
          </div>

          {/* User Info */}
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

          {error && (
            <div className="mb-6 p-4 bg-red-50 border-2 border-red-200 rounded-lg">
              <p className="text-red-700 font-medium">❌ {error}</p>
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
                  <strong>Song:</strong> {description || 'Untitled'}
                </p>
                <a
                  href={`https://testnet.monadexplorer.com/tx/${success.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                >
                  View on Explorer →
                </a>
              </div>
            </div>
          )}

          {/* Form fields */}
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Song Title *</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., Summer Vibes - Electronic Mix"
                maxLength={200}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">{description.length}/200 characters</p>
            </div>

            {/* Preview Audio */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Preview Audio (30s clip) *
              </label>
              <input
                type="file"
                accept="audio/*"
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
              <p className="text-xs text-gray-500 mt-1">Max 600KB (~30 seconds)</p>
            </div>

            {/* Full Track */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Full Track *</label>
              <input
                type="file"
                accept="audio/*"
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
              <p className="text-xs text-gray-500 mt-1">Max 15MB</p>
            </div>

            {/* Cover Art */}
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

            {/* Mint button */}
            <button
              onClick={uploadAndMint}
              disabled={
                !previewFile ||
                !fullFile ||
                !coverFile ||
                !description ||
                uploading ||
                minting
              }
              className="w-full px-6 py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-bold text-lg hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
            >
              {uploading
                ? '⏳ Uploading to IPFS...'
                : minting
                ? '⚡ Minting NFT (FREE)...'
                : '🎵 Upload & Mint (FREE!)'}
            </button>

            {!walletAddress && (
              <button
                onClick={requestWallet}
                className="w-full mt-3 px-6 py-3 bg-purple-500 text-white rounded-lg font-medium hover:bg-purple-600 transition-all"
              >
                🔑 Connect Wallet First
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
