'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';

export default function ClientNav() {
  const router = useRouter();
  const { user, walletAddress, isLoading, error, requestWallet } = useFarcasterContext();

  const farcasterUsername = user?.username;

  // Auto-request wallet when user loads
  useEffect(() => {
    if (user && !walletAddress) {
      requestWallet();
    }
  }, [user, walletAddress, requestWallet]);

  const navigateTo = (path: string) => {
    router.push(path);
  };

  return (
    <nav className="w-full bg-black/90 backdrop-blur-sm p-4 border-b border-gray-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🎵</span>
          <span className="text-white font-bold text-xl">EmpowerTours</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigateTo('/')}
            className="text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
          >
            Home
          </button>
          <button
            onClick={() => navigateTo('/music')}
            className="text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
          >
            Music
          </button>
          <button
            onClick={() => navigateTo('/dashboard')}
            className="text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
          >
            Dashboard
          </button>
          <button
            onClick={() => navigateTo('/passport')}
            className="text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
          >
            Passport
          </button>
          <button
            onClick={() => navigateTo('/market')}
            className="text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
          >
            Market
          </button>
          {user && (
            <button
              onClick={() => navigateTo('/profile')}
              className="text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
            >
              Profile
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isLoading ? (
            <div className="text-gray-400 text-sm">Loading...</div>
          ) : error || !user ? (
            <div className="text-gray-400 text-sm">Not in Farcaster</div>
          ) : (
            <div className="flex items-center gap-3">
              {user.pfpUrl && (
                <img
                  src={user.pfpUrl}
                  alt={farcasterUsername || 'User'}
                  className="w-8 h-8 rounded-full border-2 border-purple-500"
                />
              )}
              <div className="flex flex-col items-end">
                {farcasterUsername && (
                  <span className="text-white text-sm font-medium">{`@${farcasterUsername}`}</span>
                )}
                {walletAddress && (
                  <span className="text-gray-400 text-xs font-mono">
                    {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
