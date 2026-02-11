'use client';

import React, { useState, useRef, useEffect } from 'react';
import { X, Loader2, Trophy, CheckCircle2, AlertCircle, Wallet, Shield } from 'lucide-react';

interface ConsensusNFTModalProps {
  isOpen: boolean;
  onClose: () => void;
  monadAddress?: string;
}

type ModalStep = 'connect' | 'verify' | 'confirm' | 'minting' | 'success' | 'error';

export function ConsensusNFTModal({ isOpen, onClose, monadAddress }: ConsensusNFTModalProps) {
  const [step, setStep] = useState<ModalStep>('connect');
  const [ethereumAddress, setEthereumAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [nftCount, setNftCount] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setStep('connect');
      setEthereumAddress('');
      setError(null);
      setTxHash(null);
    }
  }, [isOpen]);

  async function handleVerifyEligibility() {
    if (!ethereumAddress) {
      setError('Please enter your Ethereum address');
      return;
    }

    if (!ethereumAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      setError('Invalid Ethereum address format (must start with 0x and be 42 characters)');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const res = await fetch('/api/consensus/check-eligibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ethereumAddress }),
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.error || 'Verification failed');
        setStep('error');
        return;
      }

      if (!data.eligible) {
        setError(
          '❌ This address does not own a Consensus Hong Kong NFT. You must own the NFT to participate.'
        );
        setStep('error');
        return;
      }

      setNftCount(data.nftCount);
      setStep('confirm');
    } catch (err) {
      console.error('Verification error:', err);
      setError('Failed to verify eligibility');
      setStep('error');
    } finally {
      setLoading(false);
    }
  }

  async function handleMint() {
    if (!monadAddress || !ethereumAddress) {
      setError('Missing address information');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setStep('minting');

      // Get UserSafe address from wallet context (you'll need to pass this)
      const userSafeAddress = monadAddress; // Assuming monadAddress is the UserSafe

      const res = await fetch('/api/consensus/mint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ethereumAddress,
          monadAddress,
          userSafeAddress,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.error || 'Minting failed');
        setStep('error');
        return;
      }

      setTxHash(data.txHash);
      setStep('success');
    } catch (err) {
      console.error('Mint error:', err);
      setError('Failed to mint NFT');
      setStep('error');
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 rounded-2xl shadow-2xl max-w-lg w-full border border-blue-500/30">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 to-blue-900 border-b border-blue-500/30 p-6 flex justify-between items-center rounded-t-2xl">
          <div className="flex items-center gap-3">
            <Trophy className="w-6 h-6 text-amber-400" />
            <div>
              <h2 className="text-2xl font-bold text-white">🏛️ Consensus NFT</h2>
              <p className="text-sm text-blue-200">Hong Kong 2026 Commemorative</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-6 h-6 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Step 1: Enter Ethereum Address */}
          {step === 'connect' && (
            <div className="space-y-4">
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                <div className="flex gap-3">
                  <Shield className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-blue-200">Verify Attendance</div>
                    <div className="text-sm text-blue-100 mt-1">
                      Enter the Ethereum address that owns your Consensus Hong Kong NFT to
                      mint this commemorative NFT on Monad.
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Your Ethereum Address
                </label>
                <input
                  type="text"
                  placeholder="0x..."
                  value={ethereumAddress}
                  onChange={(e) => {
                    setEthereumAddress(e.target.value);
                    setError(null);
                  }}
                  className="w-full bg-slate-800 border border-blue-500/30 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  disabled={loading}
                />
              </div>

              {error && (
                <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 text-red-200 text-sm">
                  {error}
                </div>
              )}

              <button
                onClick={handleVerifyEligibility}
                disabled={loading || !ethereumAddress}
                className={`w-full py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all ${
                  loading || !ethereumAddress
                    ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:from-blue-700 hover:to-cyan-700'
                }`}
              >
                {loading && <Loader2 className="w-5 h-5 animate-spin" />}
                {loading ? 'Verifying...' : 'Verify Eligibility'}
              </button>
            </div>
          )}

          {/* Step 2: Confirm Minting */}
          {step === 'confirm' && (
            <div className="space-y-4">
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                <div className="flex gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-green-200">✅ Eligible!</div>
                    <div className="text-sm text-green-100 mt-1">
                      Your Ethereum address owns {nftCount} Consensus NFT{nftCount > 1 ? 's' : ''}.
                      You can now mint the commemorative NFT on Monad.
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-800/50 border border-blue-500/20 rounded-lg p-4 space-y-2">
                <div className="text-sm text-gray-400">
                  <span className="font-medium text-white">Ethereum Address:</span>
                  <div className="font-mono text-xs text-blue-300 mt-1">{ethereumAddress}</div>
                </div>
                <div className="text-sm text-gray-400">
                  <span className="font-medium text-white">Monad Address:</span>
                  <div className="font-mono text-xs text-purple-300 mt-1">{monadAddress}</div>
                </div>
              </div>

              <button
                onClick={handleMint}
                disabled={loading}
                className={`w-full py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all ${
                  loading
                    ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-amber-600 to-orange-600 text-white hover:from-amber-700 hover:to-orange-700'
                }`}
              >
                {loading && <Loader2 className="w-5 h-5 animate-spin" />}
                {loading ? 'Minting...' : '🎉 Mint Consensus NFT'}
              </button>

              <button
                onClick={() => {
                  setStep('connect');
                  setEthereumAddress('');
                  setError(null);
                }}
                disabled={loading}
                className="w-full py-2 text-gray-400 hover:text-gray-300 transition-colors"
              >
                Back
              </button>
            </div>
          )}

          {/* Step 3: Minting in Progress */}
          {step === 'minting' && (
            <div className="space-y-4 text-center py-6">
              <Loader2 className="w-12 h-12 animate-spin text-blue-400 mx-auto" />
              <div>
                <div className="text-lg font-semibold text-white mb-2">Minting your NFT...</div>
                <div className="text-sm text-gray-400">
                  This may take a moment. Please don't close this window.
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Success */}
          {step === 'success' && txHash && (
            <div className="space-y-4">
              <div className="bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/50 rounded-lg p-6 text-center">
                <Trophy className="w-12 h-12 text-green-400 mx-auto mb-3" />
                <div className="text-2xl font-bold text-green-300 mb-2">🎉 Success!</div>
                <div className="text-sm text-green-100">
                  Your Consensus Hong Kong NFT has been minted!
                </div>
              </div>

              <div className="bg-slate-800/50 border border-blue-500/20 rounded-lg p-4">
                <div className="text-xs text-gray-400 mb-2">Transaction Hash:</div>
                <div className="font-mono text-xs text-blue-300 break-all">{txHash}</div>
                <a
                  href={`https://monadscan.com/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block mt-3 text-blue-400 hover:text-blue-300 text-sm"
                >
                  View on Monadscan →
                </a>
              </div>

              <button
                onClick={onClose}
                className="w-full py-3 rounded-lg font-semibold bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:from-blue-700 hover:to-cyan-700 transition-all"
              >
                Close
              </button>
            </div>
          )}

          {/* Step 5: Error */}
          {step === 'error' && (
            <div className="space-y-4">
              <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-6 text-center">
                <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
                <div className="text-lg font-bold text-red-300 mb-2">Verification Failed</div>
                <div className="text-sm text-red-100">{error}</div>
              </div>

              <button
                onClick={() => {
                  setStep('connect');
                  setEthereumAddress('');
                  setError(null);
                }}
                className="w-full py-3 rounded-lg font-semibold bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:from-blue-700 hover:to-cyan-700 transition-all"
              >
                Try Again
              </button>

              <button
                onClick={onClose}
                className="w-full py-2 text-gray-400 hover:text-gray-300 transition-colors"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
