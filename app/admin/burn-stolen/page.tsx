'use client';

import { useState } from 'react';

/**
 * Admin page for burning stolen/infringing NFT content
 * Only contract owner can execute burns
 */

interface TokenInfo {
  tokenId: number;
  owner: string;
  tokenURI: string;
  contract: string;
}

export default function BurnStolenPage() {
  const [tokenId, setTokenId] = useState('');
  const [reason, setReason] = useState('');
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [burning, setBurning] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; txHash?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lookupToken = async () => {
    if (!tokenId) return;

    setLoading(true);
    setError(null);
    setTokenInfo(null);
    setResult(null);

    try {
      const res = await fetch(`/api/admin/burn-stolen?tokenId=${tokenId}`);
      const data = await res.json();

      if (data.success) {
        setTokenInfo(data);
      } else {
        setError(data.error);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const burnToken = async () => {
    if (!tokenId || !reason) return;

    if (!confirm(`Are you sure you want to PERMANENTLY burn token #${tokenId}?\n\nReason: ${reason}\n\nThis action cannot be undone.`)) {
      return;
    }

    setBurning(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/admin/burn-stolen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenId: parseInt(tokenId), reason }),
      });

      const data = await res.json();

      if (data.success) {
        setResult({
          success: true,
          message: `Token #${tokenId} has been burned`,
          txHash: data.txHash,
        });
        setTokenInfo(null);
        setTokenId('');
        setReason('');
      } else {
        setError(data.error);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBurning(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Burn Stolen Content</h1>
        <p className="text-gray-400 mb-8">
          Admin tool to remove stolen or infringing NFTs from the platform.
          This action is permanent and cannot be undone.
        </p>

        {/* Token Lookup */}
        <div className="bg-gray-900 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">1. Lookup Token</h2>

          <div className="flex gap-4 mb-4">
            <input
              type="number"
              placeholder="Token ID"
              value={tokenId}
              onChange={(e) => setTokenId(e.target.value)}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white"
            />
            <button
              onClick={lookupToken}
              disabled={!tokenId || loading}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 px-6 py-2 rounded-lg font-medium"
            >
              {loading ? 'Looking up...' : 'Lookup'}
            </button>
          </div>

          {tokenInfo && (
            <div className="bg-gray-800 rounded-lg p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400">Token ID:</span>
                <span className="font-mono">{tokenInfo.tokenId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Owner:</span>
                <a
                  href={`https://testnet.monadscan.com/address/${tokenInfo.owner}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-blue-400 hover:underline"
                >
                  {tokenInfo.owner.slice(0, 6)}...{tokenInfo.owner.slice(-4)}
                </a>
              </div>
              {tokenInfo.tokenURI && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Token URI:</span>
                  <a
                    href={tokenInfo.tokenURI.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline truncate max-w-[200px]"
                  >
                    {tokenInfo.tokenURI.slice(0, 30)}...
                  </a>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Burn Form */}
        {tokenInfo && (
          <div className="bg-gray-900 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">2. Burn Token</h2>

            <div className="mb-4">
              <label className="block text-gray-400 mb-2">Reason for burning (required):</label>
              <textarea
                placeholder="e.g., Copyright infringement - DMCA takedown request from original artist"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white"
              />
            </div>

            <button
              onClick={burnToken}
              disabled={!reason || reason.length < 10 || burning}
              className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-700 px-6 py-3 rounded-lg font-medium"
            >
              {burning ? 'Burning...' : `Burn Token #${tokenId}`}
            </button>

            <p className="text-yellow-500 text-sm mt-4">
              Warning: This will permanently destroy the NFT. The action will be recorded on-chain with the reason provided.
            </p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 mb-6">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* Success Message */}
        {result?.success && (
          <div className="bg-green-900/50 border border-green-700 rounded-lg p-4 mb-6">
            <p className="text-green-400 mb-2">{result.message}</p>
            {result.txHash && (
              <a
                href={`https://testnet.monadscan.com/tx/${result.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline text-sm"
              >
                View transaction on MonadScan
              </a>
            )}
          </div>
        )}

        {/* Common Reasons */}
        <div className="bg-gray-900 rounded-lg p-6">
          <h3 className="font-semibold mb-3">Common Burn Reasons:</h3>
          <ul className="space-y-2 text-gray-400 text-sm">
            <li
              className="cursor-pointer hover:text-white"
              onClick={() => setReason('Copyright infringement - DMCA takedown request')}
            >
              • Copyright infringement - DMCA takedown request
            </li>
            <li
              className="cursor-pointer hover:text-white"
              onClick={() => setReason('Stolen content - reported by original creator')}
            >
              • Stolen content - reported by original creator
            </li>
            <li
              className="cursor-pointer hover:text-white"
              onClick={() => setReason('Trademark violation - unauthorized use of brand assets')}
            >
              • Trademark violation - unauthorized use of brand assets
            </li>
            <li
              className="cursor-pointer hover:text-white"
              onClick={() => setReason('Terms of service violation - prohibited content')}
            >
              • Terms of service violation - prohibited content
            </li>
            <li
              className="cursor-pointer hover:text-white"
              onClick={() => setReason('Test mint - removing test content from production')}
            >
              • Test mint - removing test content from production
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
