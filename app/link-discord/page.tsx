'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAccount, useSignMessage } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import StandaloneProviders from '@/app/components/StandaloneProviders';
import { CheckCircle, XCircle, Loader2, Wallet, Link2, Shield } from 'lucide-react';

const APP_URL = process.env.NEXT_PUBLIC_URL || '';

function LinkDiscordContent() {
  const searchParams = useSearchParams();
  const discordId = searchParams.get('discordId');

  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [status, setStatus] = useState<'idle' | 'loading' | 'signing' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [linkedWallet, setLinkedWallet] = useState<string | null>(null);

  // Check if already linked
  useEffect(() => {
    if (discordId) {
      checkExistingLink();
    }
  }, [discordId]);

  const checkExistingLink = async () => {
    try {
      const res = await fetch(`${APP_URL}/api/discord/balance?discordId=${discordId}`);
      const data = await res.json();
      if (data.linkedWallet) {
        setLinkedWallet(data.linkedWallet);
        setStatus('success');
      }
    } catch (e) {
      // Not linked yet, that's fine
    }
  };

  const handleLinkWallet = async () => {
    if (!discordId || !address) return;

    setStatus('loading');
    setError(null);

    try {
      // Step 1: Get challenge from API
      const challengeRes = await fetch(`${APP_URL}/api/discord/balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'link_wallet',
          discordId,
          walletAddress: address,
        }),
      });

      const challengeData = await challengeRes.json();

      if (!challengeData.success) {
        throw new Error(challengeData.error || 'Failed to generate challenge');
      }

      setChallenge(challengeData.challenge);
      setStatus('signing');

      // Step 2: Sign the message (MetaMask popup appears here!)
      const signature = await signMessageAsync({
        message: challengeData.challenge,
      });

      setStatus('loading');

      // Step 3: Verify signature with API
      const verifyRes = await fetch(`${APP_URL}/api/discord/balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify_signature',
          discordId,
          signature,
        }),
      });

      const verifyData = await verifyRes.json();

      if (!verifyData.success) {
        throw new Error(verifyData.error || 'Signature verification failed');
      }

      setLinkedWallet(verifyData.linkedWallet);
      setStatus('success');

    } catch (err: any) {
      console.error('Link wallet error:', err);
      setError(err.message || 'Something went wrong');
      setStatus('error');
    }
  };

  // No Discord ID provided
  if (!discordId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4">
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-8 max-w-md w-full border border-white/10">
          <div className="text-center">
            <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-white mb-2">Missing Discord ID</h1>
            <p className="text-gray-400">
              Please use the link provided by the Discord bot.
              <br /><br />
              Type <code className="bg-white/10 px-2 py-1 rounded">@EmpowerTours link wallet 0x...</code> in Discord to get your personal link.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4">
      <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-8 max-w-md w-full border border-white/10">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Link2 className="w-8 h-8 text-purple-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Link Your Wallet</h1>
          <p className="text-gray-400 text-sm">
            Connect your wallet to your Discord account for secure lottery deposits
          </p>
        </div>

        {/* Success State */}
        {status === 'success' && linkedWallet && (
          <div className="text-center">
            <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">Wallet Linked!</h2>
            <p className="text-gray-400 mb-4">
              <code className="bg-white/10 px-2 py-1 rounded text-sm">
                {linkedWallet.slice(0, 6)}...{linkedWallet.slice(-4)}
              </code>
            </p>
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-left">
              <p className="text-green-300 text-sm">
                You can now return to Discord and:
              </p>
              <ul className="text-green-200 text-sm mt-2 space-y-1">
                <li>• Type <code className="bg-white/10 px-1 rounded">@EmpowerTours deposit</code> to add funds</li>
                <li>• Type <code className="bg-white/10 px-1 rounded">@EmpowerTours buy lottery ticket</code> to play</li>
              </ul>
            </div>
          </div>
        )}

        {/* Error State */}
        {status === 'error' && (
          <div className="text-center mb-6">
            <XCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
            <p className="text-red-300">{error}</p>
            <button
              onClick={() => setStatus('idle')}
              className="mt-4 text-purple-400 hover:text-purple-300 text-sm underline"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Main Flow */}
        {status !== 'success' && (
          <>
            {/* Step 1: Connect Wallet */}
            <div className={`mb-6 p-4 rounded-xl border ${isConnected ? 'bg-green-500/10 border-green-500/20' : 'bg-white/5 border-white/10'}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isConnected ? 'bg-green-500' : 'bg-gray-600'}`}>
                  {isConnected ? <CheckCircle className="w-5 h-5 text-white" /> : <span className="text-white font-bold">1</span>}
                </div>
                <span className="text-white font-medium">Connect Wallet</span>
              </div>

              {!isConnected ? (
                <ConnectButton />
              ) : (
                <p className="text-green-300 text-sm ml-11">
                  Connected: {address?.slice(0, 6)}...{address?.slice(-4)}
                </p>
              )}
            </div>

            {/* Step 2: Sign Message */}
            <div className={`mb-6 p-4 rounded-xl border ${status === 'signing' ? 'bg-purple-500/10 border-purple-500/20' : 'bg-white/5 border-white/10'}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${status === 'signing' ? 'bg-purple-500' : 'bg-gray-600'}`}>
                  {status === 'signing' ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <span className="text-white font-bold">2</span>}
                </div>
                <span className="text-white font-medium">Sign Verification Message</span>
              </div>

              {status === 'signing' && (
                <div className="ml-11">
                  <p className="text-purple-300 text-sm mb-2">Check your wallet for the signature request...</p>
                  <div className="bg-black/20 rounded-lg p-3 text-xs text-gray-400 font-mono max-h-32 overflow-auto">
                    {challenge}
                  </div>
                </div>
              )}

              {status !== 'signing' && (
                <p className="text-gray-400 text-sm ml-11">
                  Your wallet will ask you to sign a message to prove ownership
                </p>
              )}
            </div>

            {/* Security Notice */}
            <div className="flex items-start gap-3 mb-6 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
              <Shield className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-blue-200 text-xs">
                Signing a message is <strong>free</strong> and <strong>safe</strong>. It only proves you own this wallet - no transaction is made and no funds are moved.
              </p>
            </div>

            {/* Link Button */}
            <button
              onClick={handleLinkWallet}
              disabled={!isConnected || status === 'loading' || status === 'signing'}
              className={`w-full py-3 px-4 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-2 ${
                isConnected && status !== 'loading' && status !== 'signing'
                  ? 'bg-purple-600 hover:bg-purple-700 cursor-pointer'
                  : 'bg-gray-600 cursor-not-allowed opacity-50'
              }`}
            >
              {status === 'loading' || status === 'signing' ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {status === 'signing' ? 'Waiting for signature...' : 'Processing...'}
                </>
              ) : (
                <>
                  <Wallet className="w-5 h-5" />
                  Link Wallet to Discord
                </>
              )}
            </button>
          </>
        )}

        {/* Footer */}
        <p className="text-center text-gray-500 text-xs mt-6">
          Discord ID: {discordId}
        </p>
      </div>
    </div>
  );
}

export default function LinkDiscordPage() {
  return (
    <StandaloneProviders>
      <LinkDiscordContent />
    </StandaloneProviders>
  );
}
