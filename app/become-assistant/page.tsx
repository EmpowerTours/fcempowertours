'use client';

import { useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { Address, parseEther } from 'viem';
import { useRouter } from 'next/navigation';

const PERSONAL_ASSISTANT_ADDRESS = process.env.NEXT_PUBLIC_PERSONAL_ASSISTANT as Address;

type VerificationPath = 'stake' | 'web3' | 'manual';

export default function BecomeAssistantPage() {
  const router = useRouter();
  const { address } = useAccount();

  const [selectedPath, setSelectedPath] = useState<VerificationPath | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    bio: '',
    skills: '',
    languages: '',
    hourlyRate: '',
  });

  // Document upload states
  const [idDocument, setIdDocument] = useState<File | null>(null);
  const [uploadingId, setUploadingId] = useState(false);
  const [documentHash, setDocumentHash] = useState<string | null>(null);

  const { writeContract: register, data: registerHash } = useWriteContract();
  const { isSuccess: registerSuccess } = useWaitForTransactionReceipt({ hash: registerHash });

  const handleIdUpload = async () => {
    if (!idDocument || !address) return;

    setUploadingId(true);
    try {
      const formData = new FormData();
      formData.append('file', idDocument);
      formData.append('assistantAddress', address);
      formData.append('documentType', selectedPath === 'web3' ? 'web3_verification' : 'government_id');

      const response = await fetch('/api/submit-verification-docs', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        setDocumentHash(data.documentHash);
        alert('Document uploaded and encrypted successfully!');
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Failed to upload document:', error);
      alert('Failed to upload document');
    } finally {
      setUploadingId(false);
    }
  };

  const handleRegister = async () => {
    if (!address || !selectedPath) return;

    try {
      if (selectedPath === 'stake') {
        // Register with 100 MON stake
        register({
          address: PERSONAL_ASSISTANT_ADDRESS,
          abi: PersonalAssistantABI,
          functionName: 'registerWithStake',
          value: parseEther('100'),
        });
      } else if (selectedPath === 'web3') {
        // Register with Web3 identity verification
        if (!documentHash) {
          alert('Please upload your verification proof first');
          return;
        }

        register({
          address: PERSONAL_ASSISTANT_ADDRESS,
          abi: PersonalAssistantABI,
          functionName: 'registerWithWeb3Identity',
          args: [documentHash],
        });
      } else if (selectedPath === 'manual') {
        // Register for manual verification
        if (!documentHash) {
          alert('Please upload your government ID first');
          return;
        }

        register({
          address: PERSONAL_ASSISTANT_ADDRESS,
          abi: PersonalAssistantABI,
          functionName: 'registerForManualVerification',
          args: [documentHash],
        });
      }
    } catch (error) {
      console.error('Registration failed:', error);
      alert('Registration failed');
    }
  };

  if (registerSuccess) {
    router.push('/assistant-dashboard?registered=true');
  }

  if (!address) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Connect Wallet</h1>
          <p className="text-gray-400">Please connect your wallet to become an assistant</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white p-6">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => router.back()}
          className="mb-4 text-gray-400 hover:text-white"
        >
          ← Back
        </button>

        <h1 className="text-4xl font-bold mb-2">Become a Personal Assistant</h1>
        <p className="text-gray-400 mb-8">
          Join our network of verified concierge professionals
        </p>

        {/* Verification Path Selection */}
        {!selectedPath && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold mb-4">Choose Your Verification Path</h2>

            {/* Stake Path */}
            <div
              onClick={() => setSelectedPath('stake')}
              className="bg-gradient-to-r from-purple-600 to-purple-700 rounded-xl p-6 cursor-pointer hover:from-purple-500 hover:to-purple-600 transition"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-xl font-bold mb-2">Instant Access - 100 MON Stake</h3>
                  <p className="text-purple-100 mb-3">
                    Put down a 100 MON refundable deposit and start working immediately
                  </p>
                  <ul className="text-sm text-purple-100 space-y-1">
                    <li>✓ Start working today</li>
                    <li>✓ 3% platform fee</li>
                    <li>✓ Stake returned after 10 successful jobs (4.5+ rating)</li>
                    <li>✓ Auto-upgrade to 2% fee tier</li>
                  </ul>
                </div>
                <div className="text-3xl">💎</div>
              </div>
            </div>

            {/* Web3 Identity Path */}
            <div
              onClick={() => setSelectedPath('web3')}
              className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-6 cursor-pointer hover:from-blue-500 hover:to-blue-600 transition"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-xl font-bold mb-2">Web3 Identity Verification - Free</h3>
                  <p className="text-blue-100 mb-3">
                    Verify your identity using Worldcoin, ENS, or other Web3 credentials
                  </p>
                  <ul className="text-sm text-blue-100 space-y-1">
                    <li>✓ No upfront cost</li>
                    <li>✓ Start working after verification approval</li>
                    <li>✓ 5% platform fee initially</li>
                    <li>✓ Upgrade to 2% after 10 jobs</li>
                  </ul>
                </div>
                <div className="text-3xl">🌐</div>
              </div>
            </div>

            {/* Manual Verification Path */}
            <div
              onClick={() => setSelectedPath('manual')}
              className="bg-gradient-to-r from-green-600 to-green-700 rounded-xl p-6 cursor-pointer hover:from-green-500 hover:to-green-600 transition"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-xl font-bold mb-2">Manual Verification - Free</h3>
                  <p className="text-green-100 mb-3">
                    Upload government ID for manual review by platform owner
                  </p>
                  <ul className="text-sm text-green-100 space-y-1">
                    <li>✓ No upfront cost</li>
                    <li>✓ Secure encrypted storage (only owner can view)</li>
                    <li>✓ Approval within 24-48 hours</li>
                    <li>✓ 2% platform fee (lowest rate)</li>
                  </ul>
                </div>
                <div className="text-3xl">🔐</div>
              </div>
            </div>
          </div>
        )}

        {/* Registration Form */}
        {selectedPath && (
          <div className="space-y-6">
            <div className="bg-gray-800 rounded-xl p-6">
              <h2 className="text-2xl font-bold mb-4">
                {selectedPath === 'stake' && 'Stake-Based Registration'}
                {selectedPath === 'web3' && 'Web3 Identity Registration'}
                {selectedPath === 'manual' && 'Manual Verification Registration'}
              </h2>

              <button
                onClick={() => setSelectedPath(null)}
                className="text-sm text-gray-400 hover:text-white mb-6"
              >
                ← Change verification path
              </button>

              {/* Basic Info */}
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Full Name*</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
                    placeholder="John Doe"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-2">Bio*</label>
                  <textarea
                    value={formData.bio}
                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white h-24"
                    placeholder="Tell travelers about yourself and your experience..."
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-2">Skills & Services*</label>
                  <input
                    type="text"
                    value={formData.skills}
                    onChange={(e) => setFormData({ ...formData, skills: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
                    placeholder="Personal chef, driver, tour guide, translator"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-2">Languages*</label>
                  <input
                    type="text"
                    value={formData.languages}
                    onChange={(e) => setFormData({ ...formData, languages: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
                    placeholder="English, Spanish, French"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-2">Hourly Rate (WMON)*</label>
                  <input
                    type="text"
                    value={formData.hourlyRate}
                    onChange={(e) => setFormData({ ...formData, hourlyRate: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
                    placeholder="50"
                    required
                  />
                </div>
              </div>

              {/* Document Upload (for web3 and manual paths) */}
              {(selectedPath === 'web3' || selectedPath === 'manual') && (
                <div className="bg-gray-900 rounded-lg p-6 mb-6">
                  <h3 className="text-lg font-bold mb-2">
                    {selectedPath === 'web3' ? 'Verification Proof' : 'Government ID'}
                  </h3>
                  <p className="text-sm text-gray-400 mb-4">
                    {selectedPath === 'web3'
                      ? 'Upload proof of your Web3 identity (Worldcoin verification, ENS profile, etc.)'
                      : 'Upload a photo of your government-issued ID (passport, driver\'s license, etc.)'}
                  </p>
                  <p className="text-xs text-yellow-400 mb-4">
                    🔒 Your document will be encrypted and only viewable by the platform owner
                  </p>

                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => setIdDocument(e.target.files?.[0] || null)}
                    className="hidden"
                    id="id-upload"
                  />

                  <label
                    htmlFor="id-upload"
                    className="block w-full bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg font-semibold text-center cursor-pointer mb-3"
                  >
                    📄 Select Document
                  </label>

                  {idDocument && (
                    <div className="mb-3">
                      <div className="text-sm text-gray-300 mb-2">
                        Selected: {idDocument.name} ({(idDocument.size / 1024 / 1024).toFixed(2)} MB)
                      </div>
                      {!documentHash && (
                        <button
                          onClick={handleIdUpload}
                          disabled={uploadingId}
                          className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-700 px-6 py-3 rounded-lg font-semibold"
                        >
                          {uploadingId ? 'Encrypting & Uploading...' : '🔒 Upload Securely'}
                        </button>
                      )}
                    </div>
                  )}

                  {documentHash && (
                    <div className="bg-green-900/20 border border-green-700 rounded-lg p-3">
                      <div className="text-green-400 font-semibold mb-1">✓ Uploaded & Encrypted</div>
                      <div className="text-xs font-mono text-gray-400 break-all">
                        Hash: {documentHash}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Registration Summary */}
              <div className="bg-gray-900 rounded-lg p-6 mb-6">
                <h3 className="text-lg font-bold mb-4">Registration Summary</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Verification Path:</span>
                    <span className="font-semibold">
                      {selectedPath === 'stake' && 'Stake-Based (100 MON)'}
                      {selectedPath === 'web3' && 'Web3 Identity'}
                      {selectedPath === 'manual' && 'Manual Verification'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Platform Fee:</span>
                    <span className="font-semibold">
                      {selectedPath === 'stake' && '3% → 2% after 10 jobs'}
                      {selectedPath === 'web3' && '5% → 2% after 10 jobs'}
                      {selectedPath === 'manual' && '2%'}
                    </span>
                  </div>
                  {selectedPath === 'stake' && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Deposit Required:</span>
                      <span className="font-semibold">100 MON (refundable)</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Submit Button */}
              <button
                onClick={handleRegister}
                disabled={
                  (selectedPath === 'web3' || selectedPath === 'manual') && !documentHash
                }
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed px-6 py-4 rounded-lg font-bold text-lg"
              >
                {selectedPath === 'stake' && 'Register & Stake 100 MON'}
                {selectedPath === 'web3' && 'Submit for Web3 Verification'}
                {selectedPath === 'manual' && 'Submit for Manual Review'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const PersonalAssistantABI = [
  {
    inputs: [],
    name: 'registerWithStake',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [{ name: 'verificationProofHash', type: 'string' }],
    name: 'registerWithWeb3Identity',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'verificationProofHash', type: 'string' }],
    name: 'registerForManualVerification',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;
