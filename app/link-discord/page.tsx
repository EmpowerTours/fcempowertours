'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAccount, useSignMessage } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import StandaloneProviders from '@/app/components/StandaloneProviders';
import { CheckCircle, XCircle, Loader2, Wallet, Link2, Shield, Sparkles, Zap } from 'lucide-react';

// Use relative URL for same-origin requests, or fallback to production
const APP_URL = typeof window !== 'undefined'
  ? '' // Use relative URL on client (same origin)
  : (process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app');

function LinkDiscordContent() {
  const searchParams = useSearchParams();
  const discordId = searchParams.get('discordId');

  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [status, setStatus] = useState<'idle' | 'loading' | 'signing' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [linkedWallet, setLinkedWallet] = useState<string | null>(null);

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
    } catch (e) {}
  };

  const handleLinkWallet = async () => {
    if (!discordId || !address) return;

    setStatus('loading');
    setError(null);

    try {
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

      const signature = await signMessageAsync({
        message: challengeData.challenge,
      });

      setStatus('loading');

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

  if (!discordId) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4 relative overflow-hidden">
        {/* Animated background */}
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-black to-blue-900/20" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-[128px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-600/20 rounded-full blur-[128px] animate-pulse delay-1000" />

        <div className="relative z-10 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl rounded-3xl p-8 max-w-md w-full border border-white/10 shadow-2xl">
          <div className="text-center">
            <div className="w-20 h-20 mx-auto mb-6 relative">
              <div className="absolute inset-0 bg-red-500/20 rounded-full animate-ping" />
              <div className="relative w-20 h-20 bg-gradient-to-br from-red-500 to-red-600 rounded-full flex items-center justify-center">
                <XCircle className="w-10 h-10 text-white" />
              </div>
            </div>
            <h1 className="text-3xl font-bold text-white mb-3 tracking-tight">Missing Discord ID</h1>
            <p className="text-gray-400 leading-relaxed">
              Use the link from Discord bot.
              <br /><br />
              Type <code className="bg-white/10 px-3 py-1 rounded-lg text-purple-300 font-mono text-sm">@EmpowerToursAgent link wallet</code>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background gradients */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-black to-blue-900/20" />
      <div className="absolute top-0 left-0 w-full h-full">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-purple-600/30 rounded-full blur-[128px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-blue-600/30 rounded-full blur-[128px] animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-pink-600/20 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      {/* Floating particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-white/30 rounded-full animate-float"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 5}s`,
              animationDuration: `${3 + Math.random() * 4}s`,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Main Card */}
        <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl rounded-3xl p-8 border border-white/10 shadow-2xl">

          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-20 h-20 mx-auto mb-6 relative">
              <div className="absolute inset-0 bg-purple-500/30 rounded-full animate-ping" style={{ animationDuration: '2s' }} />
              <div className="relative w-20 h-20 bg-gradient-to-br from-purple-500 via-purple-600 to-blue-600 rounded-full flex items-center justify-center shadow-lg shadow-purple-500/25">
                <Link2 className="w-10 h-10 text-white" />
              </div>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">
              {status === 'success' ? 'Wallet Linked!' : 'Link Your Wallet'}
            </h1>
            <p className="text-gray-400 text-sm">
              {status === 'success'
                ? 'You\'re all set for the lottery!'
                : 'Secure your Discord account with your wallet'}
            </p>
          </div>

          {/* Success State */}
          {status === 'success' && linkedWallet && (
            <div className="space-y-6">
              <div className="flex items-center justify-center">
                <div className="relative">
                  <div className="absolute inset-0 bg-green-500/30 rounded-full animate-ping" />
                  <div className="relative w-24 h-24 bg-gradient-to-br from-green-400 to-emerald-600 rounded-full flex items-center justify-center">
                    <CheckCircle className="w-12 h-12 text-white" />
                  </div>
                </div>
              </div>

              <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                <p className="text-gray-400 text-xs uppercase tracking-wider mb-2">Connected Wallet</p>
                <p className="font-mono text-white text-lg">
                  {linkedWallet.slice(0, 6)}...{linkedWallet.slice(-4)}
                </p>
              </div>

              <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-2xl p-5 border border-green-500/20">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-5 h-5 text-green-400" />
                  <span className="text-green-300 font-medium">Next Steps</span>
                </div>
                <ul className="text-green-200/80 text-sm space-y-2">
                  <li className="flex items-center gap-2">
                    <Zap className="w-4 h-4" />
                    <code className="bg-black/30 px-2 py-0.5 rounded">@EmpowerToursAgent deposit</code>
                  </li>
                  <li className="flex items-center gap-2">
                    <Zap className="w-4 h-4" />
                    <code className="bg-black/30 px-2 py-0.5 rounded">@EmpowerToursAgent buy lottery ticket</code>
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* Error State */}
          {status === 'error' && (
            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-red-500 to-red-600 rounded-full flex items-center justify-center">
                <XCircle className="w-8 h-8 text-white" />
              </div>
              <p className="text-red-300 mb-4">{error}</p>
              <button
                onClick={() => setStatus('idle')}
                className="text-purple-400 hover:text-purple-300 text-sm underline underline-offset-4 transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Main Flow */}
          {status !== 'success' && status !== 'error' && (
            <div className="space-y-4">
              {/* Step 1: Connect Wallet */}
              <div className={`p-5 rounded-2xl border transition-all duration-300 ${
                isConnected
                  ? 'bg-gradient-to-r from-green-500/10 to-emerald-500/10 border-green-500/30'
                  : 'bg-white/5 border-white/10 hover:border-white/20'
              }`}>
                <div className="flex items-center gap-4 mb-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                    isConnected
                      ? 'bg-gradient-to-br from-green-400 to-emerald-600'
                      : 'bg-white/10'
                  }`}>
                    {isConnected ? (
                      <CheckCircle className="w-5 h-5 text-white" />
                    ) : (
                      <span className="text-white font-bold">1</span>
                    )}
                  </div>
                  <div>
                    <p className="text-white font-medium">Connect Wallet</p>
                    <p className="text-gray-500 text-xs">Rainbow, MetaMask, or any wallet</p>
                  </div>
                </div>

                {!isConnected ? (
                  <div className="pl-14">
                    <ConnectButton />
                  </div>
                ) : (
                  <div className="pl-14 flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                    <span className="text-green-300 text-sm font-mono">
                      {address?.slice(0, 6)}...{address?.slice(-4)}
                    </span>
                  </div>
                )}
              </div>

              {/* Step 2: Sign Message */}
              <div className={`p-5 rounded-2xl border transition-all duration-300 ${
                status === 'signing'
                  ? 'bg-gradient-to-r from-purple-500/10 to-blue-500/10 border-purple-500/30'
                  : 'bg-white/5 border-white/10'
              }`}>
                <div className="flex items-center gap-4 mb-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                    status === 'signing'
                      ? 'bg-gradient-to-br from-purple-500 to-blue-600'
                      : 'bg-white/10'
                  }`}>
                    {status === 'signing' ? (
                      <Loader2 className="w-5 h-5 text-white animate-spin" />
                    ) : (
                      <span className="text-white font-bold">2</span>
                    )}
                  </div>
                  <div>
                    <p className="text-white font-medium">Sign Message</p>
                    <p className="text-gray-500 text-xs">Prove wallet ownership (free)</p>
                  </div>
                </div>

                {status === 'signing' && (
                  <div className="pl-14">
                    <div className="bg-black/30 rounded-xl p-3 mb-2 border border-white/5">
                      <p className="text-purple-300 text-sm mb-2">Check your wallet...</p>
                      <p className="text-xs text-gray-500 font-mono leading-relaxed line-clamp-3">
                        {challenge}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Security Badge */}
              <div className="flex items-center gap-3 p-4 bg-blue-500/5 rounded-xl border border-blue-500/10">
                <Shield className="w-5 h-5 text-blue-400 flex-shrink-0" />
                <p className="text-blue-200/70 text-xs leading-relaxed">
                  <strong className="text-blue-300">Free & Safe.</strong> Signing only proves ownership — no transaction, no gas, no funds moved.
                </p>
              </div>

              {/* Link Button */}
              <button
                onClick={handleLinkWallet}
                disabled={!isConnected || status === 'loading' || status === 'signing'}
                className={`w-full py-4 px-6 rounded-2xl font-semibold text-white transition-all duration-300 flex items-center justify-center gap-3 ${
                  isConnected && status !== 'loading' && status !== 'signing'
                    ? 'bg-gradient-to-r from-purple-600 via-purple-500 to-blue-600 hover:from-purple-500 hover:via-purple-400 hover:to-blue-500 shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 hover:scale-[1.02] active:scale-[0.98]'
                    : 'bg-gray-800 cursor-not-allowed opacity-50'
                }`}
              >
                {status === 'loading' || status === 'signing' ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {status === 'signing' ? 'Sign in wallet...' : 'Verifying...'}
                  </>
                ) : (
                  <>
                    <Wallet className="w-5 h-5" />
                    Link Wallet to Discord
                  </>
                )}
              </button>
            </div>
          )}

          {/* Discord ID Footer */}
          <div className="mt-6 pt-6 border-t border-white/5 text-center">
            <p className="text-gray-600 text-xs font-mono">
              Discord ID: {discordId}
            </p>
          </div>
        </div>

        {/* Bottom glow */}
        <div className="absolute -bottom-20 left-1/2 -translate-x-1/2 w-3/4 h-20 bg-purple-600/20 blur-3xl rounded-full" />
      </div>

      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); opacity: 0.3; }
          50% { transform: translateY(-20px) rotate(180deg); opacity: 0.8; }
        }
        .animate-float {
          animation: float 4s ease-in-out infinite;
        }
      `}</style>
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
